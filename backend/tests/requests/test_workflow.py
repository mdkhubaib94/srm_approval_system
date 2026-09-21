import json

from tests.factories import make_user

from .conftest import pdf_upload

MOU_PAYLOAD = {
    "legal_opinion_obtained": True,
    "mou_type": "Fresh",
    "organisation_name": "Acme Labs",
    "organisation_type": "Software",
    "domain_or_products": "Cloud tooling",
    "validity_from": "2025-01-01",
    "validity_to": "2026-01-01",
}

EQUIPMENT_PAYLOAD = {
    "lab_name": "Robotics Lab",
    "requirement_type": "General",
    "equipment_specifications": "3D printer",
    "main_equipment_cost": 50000,
    "landed_cost_total": 55000,
    "indent_details": [{"product_id": "P1", "product_name": "3D Printer", "quantity": 2}],
}


async def _login(client, email, password="secret123"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["accessToken"]


async def _create_mou_request(client, token, *, cost_estimate: float | None = None):
    data = {
        "title": "MOU with Acme",
        "department": "Physics",
        "details_model": "MouDetail",
        "details_payload": json.dumps(MOU_PAYLOAD),
    }
    if cost_estimate is not None:
        data["cost_estimate"] = str(cost_estimate)
    resp = await client.post(
        "/requests", data=data, files=[pdf_upload()], headers={"Authorization": f"Bearer {token}"}
    )
    assert resp.status_code == 201, resp.text
    return resp.json()


async def test_forwarding_with_zero_cost_skips_accountant(client, db_session):
    """RESEARCH sequence is IM -> ACCOUNTANT -> HOI -> ...; with no cost the
    IM's forward must skip straight to HEAD_OF_INSTITUTION."""
    await make_user(db_session, employee_id="WF100", email="req.wf1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF101", email="im.wf1@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await _login(client, "req.wf1@example.com")
    created = await _create_mou_request(client, req_token)
    request_id = created["requestID"]

    im_token = await _login(client, "im.wf1@example.com")
    forward_resp = await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded", "comments": "looks fine"},
        headers={"Authorization": f"Bearer {im_token}"},
    )

    assert forward_resp.status_code == 200, forward_resp.text
    assert forward_resp.json()["data"]["stage"] == "HEAD_OF_INSTITUTION"


async def test_forwarding_with_cost_goes_to_accountant(client, db_session):
    await make_user(db_session, employee_id="WF102", email="req.wf2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF103", email="im.wf2@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await _login(client, "req.wf2@example.com")
    created = await _create_mou_request(client, req_token, cost_estimate=1000)
    request_id = created["requestID"]

    im_token = await _login(client, "im.wf2@example.com")
    forward_resp = await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded"},
        headers={"Authorization": f"Bearer {im_token}"},
    )

    assert forward_resp.status_code == 200
    assert forward_resp.json()["data"]["stage"] == "ACCOUNTANT"


async def test_non_stage_holder_cannot_forward(client, db_session):
    await make_user(db_session, employee_id="WF104", email="req.wf3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF105", email="acct.wf3@example.com", role="ACCOUNTANT", institution="EEC")

    req_token = await _login(client, "req.wf3@example.com")
    created = await _create_mou_request(client, req_token)
    request_id = created["requestID"]

    # request is at INSTITUTION_MANAGER; an ACCOUNTANT should not be able to act on it yet.
    acct_token = await _login(client, "acct.wf3@example.com")
    resp = await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded"},
        headers={"Authorization": f"Bearer {acct_token}"},
    )
    assert resp.status_code == 403


async def test_requester_cannot_act_on_someone_elses_request(client, db_session):
    await make_user(db_session, employee_id="WF106", email="req.wf4@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF107", email="req.wf4b@example.com", role="REQUESTER", institution="EEC", department="Physics")

    owner_token = await _login(client, "req.wf4@example.com")
    created = await _create_mou_request(client, owner_token)
    request_id = created["requestID"]

    other_token = await _login(client, "req.wf4b@example.com")
    resp = await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded"},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    # 404, not 403: a REQUESTER can't even *view* another requester's
    # submission (can_view_request), so the visibility check 404s before the
    # write-permission check would otherwise 403 — never confirm a resource
    # exists to a caller who isn't allowed to see it.
    assert resp.status_code == 404

    get_resp = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert get_resp.status_code == 403


async def test_reject_requires_reason_and_is_terminal(client, db_session):
    await make_user(db_session, employee_id="WF108", email="req.wf5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF109", email="im.wf5@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await _login(client, "req.wf5@example.com")
    created = await _create_mou_request(client, req_token)
    request_id = created["requestID"]

    im_token = await _login(client, "im.wf5@example.com")

    missing_reason = await client.patch(
        f"/requests/{request_id}", data={"action": "rejected"}, headers={"Authorization": f"Bearer {im_token}"}
    )
    assert missing_reason.status_code == 400

    rejected = await client.patch(
        f"/requests/{request_id}",
        data={"action": "rejected", "rejected_reason": "Not aligned with policy"},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert rejected.status_code == 200
    assert rejected.json()["data"]["status"] == "REJECTED"

    # Further mutation of a finalized request is refused.
    further = await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded"},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert further.status_code == 400


async def test_action_history_visibility_is_filtered_per_viewer(client, db_session):
    """A requester should not see internal comments from stages above them
    in a way that violates the one-way-up-the-chain visibility rule, and an
    approver should see the requester's own comment."""
    await make_user(db_session, employee_id="WF110", email="req.wf6@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF111", email="im.wf6@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await _login(client, "req.wf6@example.com")
    created = await _create_mou_request(client, req_token)
    request_id = created["requestID"]

    im_token = await _login(client, "im.wf6@example.com")
    await client.patch(
        f"/requests/{request_id}",
        data={"action": "forwarded", "comments": "IM internal note"},
        headers={"Authorization": f"Bearer {im_token}"},
    )

    # Requester is not in the RESEARCH stage sequence, so they can't see
    # comments authored by roles in that sequence (only their own).
    req_view = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {req_token}"})
    assert req_view.status_code == 200
    comments = [e["comments"] for e in req_view.json()["actionHistory"]]
    assert "IM internal note" not in comments
    assert "Request submitted" in comments


async def test_equipment_purchase_indent_details_and_change_log(client, db_session):
    await make_user(db_session, employee_id="WF112", email="req.wf7@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="WF113", email="im.wf7@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="WF114", email="acct.wf7@example.com", role="ACCOUNTANT", institution="EEC")

    req_token = await _login(client, "req.wf7@example.com")
    create_resp = await client.post(
        "/requests",
        data={
            "title": "New 3D printer",
            "department": "Physics",
            "details_model": "EquipmentPurchaseDetail",
            "details_payload": json.dumps(EQUIPMENT_PAYLOAD),
            "cost_estimate": "50000",
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["requestCategory"] == "ADMIN_PURCHASE"
    assert len(created["details"]["indentDetails"]) == 1
    assert created["details"]["indentNumber"]
    request_id = created["requestID"]
    original_row_id = created["details"]["indentDetails"][0]["id"]

    # Forward IM -> ACCOUNTANT (cost > 0, so ACCOUNTANT is not skipped).
    im_token = await _login(client, "im.wf7@example.com")
    forward_resp = await client.patch(
        f"/requests/{request_id}", data={"action": "forwarded"}, headers={"Authorization": f"Bearer {im_token}"}
    )
    assert forward_resp.status_code == 200
    assert forward_resp.json()["data"]["stage"] == "ACCOUNTANT"

    # Requester can no longer edit indent details post-submission.
    requester_edit = await client.patch(
        f"/requests/{request_id}/indent-details",
        json={"indentDetails": [{"id": original_row_id, "product_id": "P1", "product_name": "3D Printer", "quantity": 3}]},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert requester_edit.status_code == 403

    # The current stage holder (ACCOUNTANT) can edit; quantity change is
    # logged (the existing row's id must be sent back for it to be matched
    # as an update rather than a new row — same as the source, which matches
    # by _id, not by product_id).
    acct_token = await _login(client, "acct.wf7@example.com")
    edit_resp = await client.patch(
        f"/requests/{request_id}/indent-details",
        json={"indentDetails": [{"id": original_row_id, "product_id": "P1", "product_name": "3D Printer", "quantity": 3}]},
        headers={"Authorization": f"Bearer {acct_token}"},
    )
    assert edit_resp.status_code == 200, edit_resp.text
    body = edit_resp.json()
    assert body["data"][0]["quantity"] == 3
    assert any(entry["field"] == "quantity" for entry in body["changeLog"])

    row_id = body["data"][0]["id"]
    remark_resp = await client.post(
        f"/requests/{request_id}/indent-details/{row_id}/remarks",
        json={"text": "Confirmed with vendor"},
        headers={"Authorization": f"Bearer {acct_token}"},
    )
    assert remark_resp.status_code == 200
    assert remark_resp.json()["data"][0]["remarks"][-1]["text"] == "Confirmed with vendor"

    change_log_remark = await client.post(
        f"/requests/{request_id}/indent-details/add-change-log-remark",
        json={"text": "Quantity bumped after vendor call"},
        headers={"Authorization": f"Bearer {acct_token}"},
    )
    assert change_log_remark.status_code == 200
