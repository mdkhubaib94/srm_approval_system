"""Regression coverage for the frontend-compatibility layer added when
wiring up the Vite app: camelCase + `_id` mirroring on every JSON response,
attachment arrays that were previously silently dropped from
policies/queries/completed/sops/requests, and the populated `sopId` +
embedded `queries`/`queryAttachments` on a single request's detail view.
None of this existed before, so there was nothing here to regress —
these tests exist so a future change can't quietly drop it again.
"""

import json

from tests.api_helpers import login, pdf_upload
from tests.factories import make_user

MOU_PAYLOAD = {
    "legal_opinion_obtained": True,
    "mou_type": "Fresh",
    "organisation_name": "Acme Labs",
    "organisation_type": "Software",
    "domain_or_products": "Cloud tooling",
    "validity_from": "2025-01-01",
    "validity_to": "2026-01-01",
}


async def test_responses_are_camelcased_with_mirrored_mongo_style_id(client, db_session):
    await make_user(db_session, employee_id="FE100", email="fe1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "fe1@example.com")

    resp = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()

    # Mongo-style `_id` mirrors the real `id` — the frontend reads `_id`
    # everywhere, having been written against the original Mongo-backed API.
    assert body["_id"] == body["id"]
    # employeeID keeps its Mongoose-era acronym casing, not generic camelCase.
    assert "employeeID" in body
    assert "employee_id" not in body


async def test_request_response_includes_attachments_and_camelcased_ids(client, db_session):
    await make_user(db_session, employee_id="FE101", email="fe2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "fe2@example.com")

    create_resp = await client.post(
        "/requests",
        data={
            "title": "FE contract check",
            "department": "Physics",
            "detailsModel": "MouDetail",
            "detailsPayload": json.dumps(MOU_PAYLOAD),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()

    # The create endpoint itself accepts the frontend's real camelCase
    # multipart field names (detailsModel/detailsPayload), not just the
    # snake_case names this codebase's own tests happen to use.
    assert created["detailsModel"] == "MouDetail"
    assert created["_id"] == created["id"]

    # Previously missing entirely: every owning entity's uploaded files.
    assert len(created["attachments"]) == 1
    assert created["attachments"][0]["filename"] == "attachment.pdf"
    assert created["attachments"][0]["mimetype"] == "application/pdf"

    # Nested detail groups round-trip: financials/validity/etc. were
    # flattened for Postgres storage but the frontend still reads them
    # nested the way the original Mongoose schema had them.
    assert created["details"]["organisationName"] == "Acme Labs"
    assert created["details"]["validity"]["from"] == "2025-01-01"

    request_id = created["requestID"]
    detail_resp = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {token}"})
    assert detail_resp.status_code == 200
    detail_body = detail_resp.json()

    # Only the single-item view aggregates this request's queries.
    assert detail_body["queries"] == []
    assert detail_body["queryAttachments"] == []


async def test_policy_response_includes_attachments(client, db_session):
    await make_user(db_session, employee_id="FE102", email="fe3@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    token = await login(client, "fe3@example.com")

    create_resp = await client.post(
        "/policies",
        data={"title": "FE Policy", "description": "Contract check"},
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    data = create_resp.json()["data"]

    assert data["_id"] == data["id"]
    assert len(data["attachments"]) == 1
    assert data["attachments"][0]["filename"] == "attachment.pdf"


async def test_request_sop_id_is_populated_not_a_bare_int(client, db_session):
    await make_user(db_session, employee_id="FE103", email="fe4@example.com", role="CHAIRMAN_OFFICE")
    admin_token = await login(client, "fe4@example.com")

    sop_resp = await client.post(
        "/sops",
        data={"reference_number": "FE-SOP-1", "title": "FE SOP", "description": "Contract check SOP"},
        files=[pdf_upload("sop.pdf")],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert sop_resp.status_code == 201, sop_resp.text
    sop_id = sop_resp.json()["data"]["id"]

    await make_user(db_session, employee_id="FE104", email="fe5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    req_token = await login(client, "fe5@example.com")

    create_resp = await client.post(
        "/requests",
        data={
            "title": "FE SOP link check",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
            "sopId": str(sop_id),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    body = create_resp.json()

    # sopId comes back populated (referenceNumber/title/attachments), the
    # same shape Mongoose's .populate('sopId', ...) produced — not the bare
    # foreign-key integer this codebase stores it as.
    assert isinstance(body["sopId"], dict)
    assert body["sopId"]["referenceNumber"] == "FE-SOP-1"
    assert body["sopId"]["_id"] == sop_id


async def test_request_action_history_uses_timestamp_field_not_created_at(client, db_session):
    # Node's actionHistory sub-documents (Request.js) name this field
    # `timestamp`; the frontend's ActionHistory component reads
    # `action.timestamp` and renders "Invalid Date" for anything else
    # (createdAt included), which a generic created_at -> createdAt case
    # conversion would otherwise silently produce.
    await make_user(db_session, employee_id="FE105", email="fe6@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "fe6@example.com")

    create_resp = await client.post(
        "/requests",
        data={
            "title": "FE action history check",
            "department": "Physics",
            "detailsModel": "MouDetail",
            "detailsPayload": json.dumps(MOU_PAYLOAD),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    entry = create_resp.json()["actionHistory"][0]
    assert "timestamp" in entry
    assert "createdAt" not in entry


async def test_list_requests_endpoint_includes_action_history(client, db_session):
    # GET /requests (the requester's own list) previously 500'd:
    # serialize_request() unconditionally reads request.action_history, but
    # the list-query functions only eager-loaded `requester`, so accessing
    # the relationship lazily on an AsyncSession raised MissingGreenlet.
    await make_user(db_session, employee_id="FE106", email="fe7@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "fe7@example.com")

    create_resp = await client.post(
        "/requests",
        data={
            "title": "FE list check",
            "department": "Physics",
            "detailsModel": "MouDetail",
            "detailsPayload": json.dumps(MOU_PAYLOAD),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text

    list_resp = await client.get("/requests", headers={"Authorization": f"Bearer {token}"})
    assert list_resp.status_code == 200, list_resp.text
    row = list_resp.json()["data"][0]
    assert len(row["actionHistory"]) == 1
    assert "timestamp" in row["actionHistory"][0]
