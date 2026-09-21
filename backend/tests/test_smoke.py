"""Phase 9 deliverable: a single cross-phase end-to-end smoke test that
exercises auth, the request workflow engine (incl. indent tables), a
query-raise/resolve SLA pause, file upload/download, and the CHAIRMAN-approval
-> Completed spawn/close cycle in one continuous story, using one full
category (ADMIN_PURCHASE) top to bottom.

Per-module edge cases (403/404 boundaries, per-detail-type payloads, indent
change-log diffing, etc.) already have dedicated coverage elsewhere; this
test only proves the modules built across Phases 1-8 actually compose into
one working system end to end.
"""

import json

from sqlalchemy import select

from app.completed.models import Completed
from app.files.models import RequestAttachment
from app.requests.workflow import CATEGORY_STAGE_SEQUENCES
from tests.api_helpers import login, pdf_upload
from tests.factories import make_user

EQUIPMENT_PAYLOAD = {
    "lab_name": "Smoke Test Lab",
    "requirement_type": "General",
    "equipment_specifications": "10 oscilloscopes",
    "main_equipment_cost": 75000,
    "landed_cost_total": 80000,
    "indent_details": [{"product_id": "OSC-1", "product_name": "Oscilloscope", "quantity": 10}],
}

# ADMIN_PURCHASE sequence: INSTITUTION_MANAGER, ACCOUNTANT, HEAD_OF_INSTITUTION,
# CHAIRMAN_OFFICE, MMA, AUDIT, MANAGER_ACCOUNTS, DEAN_ADMIN, CHAIRMAN.
ACTOR_ROLES = CATEGORY_STAGE_SEQUENCES["ADMIN_PURCHASE"]
INSTITUTION_SCOPED_ROLES = {"INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION"}


async def test_full_request_lifecycle_smoke(client, db_session):
    await make_user(
        db_session, employee_id="SMK-REQ", email="smoke.req@example.com", role="REQUESTER",
        institution="EEC", department="Physics",
    )
    req_token = await login(client, "smoke.req@example.com")

    # ── 1. Create (requests + files + indent tables) ────────────────────────
    create_resp = await client.post(
        "/requests",
        data={
            "title": "Smoke test: 10 oscilloscopes",
            "department": "Physics",
            "details_model": "EquipmentPurchaseDetail",
            "details_payload": json.dumps(EQUIPMENT_PAYLOAD),
            "cost_estimate": "75000",
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["requestCategory"] == "ADMIN_PURCHASE"
    assert created["stage"] == "INSTITUTION_MANAGER"
    assert created["status"] == "PENDING"
    assert len(created["details"]["indentDetails"]) == 1

    request_id = created["requestID"]
    request_db_id = created["id"]

    # ── 2. Query raise/resolve pauses and resumes the SLA clock ─────────────
    await make_user(
        db_session, employee_id="SMK-IM", email="smoke.im@example.com", role="INSTITUTION_MANAGER",
        institution="EEC",
    )
    im_token = await login(client, "smoke.im@example.com")

    raise_resp = await client.post(
        "/queries",
        json={"request": str(request_db_id), "query": "Please justify the 10-unit quantity."},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert raise_resp.status_code == 201, raise_resp.text
    query_id = raise_resp.json()["data"]["id"]

    paused_view = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {req_token}"})
    assert paused_view.json()["status"] == "QUERY"

    resolve_resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Needed for the new lab section.", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resolve_resp.status_code == 200, resolve_resp.text

    resumed_view = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {req_token}"})
    assert resumed_view.json()["status"] == "PENDING"
    assert resumed_view.json()["stage"] == "INSTITUTION_MANAGER"

    # ── 3. Forward through every stage of the category, approve at CHAIRMAN ─
    for role in ACTOR_ROLES:
        if role == "INSTITUTION_MANAGER":
            token = im_token
        else:
            email = f"smoke.{role.lower()}@example.com"
            institution = "EEC" if role in INSTITUTION_SCOPED_ROLES else None
            await make_user(db_session, employee_id=f"SMK-{role}", email=email, role=role, institution=institution)
            token = await login(client, email)

        data = {"action": "forwarded", "comments": f"cleared by {role}"}
        if role == "CHAIRMAN":
            data["status_update"] = "APPROVED"

        resp = await client.patch(f"/requests/{request_id}", data=data, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, f"forward by {role} failed: {resp.text}"

    final_view = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {req_token}"})
    final_body = final_view.json()
    assert final_body["status"] == "APPROVED"
    assert final_body["stage"] == "CHAIRMAN"

    # ── 4. Approval spawns a Completed record ────────────────────────────────
    completed_row = (
        await db_session.execute(select(Completed).where(Completed.request_id == request_db_id))
    ).scalar_one()
    assert completed_row.completed_status is False

    # ── 5. The original attachment is still downloadable (files module) ────
    attachment = (
        await db_session.execute(select(RequestAttachment).where(RequestAttachment.request_id == request_db_id))
    ).scalars().first()
    assert attachment is not None

    download_resp = await client.get(f"/uploads/files/{attachment.file_id}", headers={"Authorization": f"Bearer {req_token}"})
    assert download_resp.status_code == 200
    assert download_resp.headers["content-type"] == "application/pdf"

    # ── 6. Requester marks the work actually complete (one-shot) ───────────
    actual_resp = await client.patch(
        f"/completed/{completed_row.id}/actual",
        data={"completion_date": "2026-01-15", "completed_status": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert actual_resp.status_code == 200, actual_resp.text
    assert actual_resp.json()["data"]["completedStatus"] is True

    second_attempt = await client.patch(
        f"/completed/{completed_row.id}/actual",
        data={"reason_for_pending": "should be refused, already completed"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert second_attempt.status_code == 400
