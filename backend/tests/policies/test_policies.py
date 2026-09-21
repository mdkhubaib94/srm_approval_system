from tests.api_helpers import login, pdf_upload
from tests.factories import make_user


async def test_only_head_of_institution_can_create_policy(client, db_session):
    await make_user(db_session, employee_id="POL100", email="req.pol1@example.com", role="REQUESTER")
    token = await login(client, "req.pol1@example.com")

    resp = await client.post(
        "/policies",
        data={"title": "New Leave Policy", "description": "Updated leave rules"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_create_and_list_policy_full_vs_readonly_projection(client, db_session):
    await make_user(db_session, employee_id="POL101", email="hoi.pol1@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="POL102", email="acct.pol1@example.com", role="ACCOUNTANT", institution="EEC")

    hoi_token = await login(client, "hoi.pol1@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "New Leave Policy", "description": "Updated leave rules", "cost": "1000"},
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    policy_id = create_resp.json()["data"]["id"]

    # Non-approval role gets the reduced projection (no rejected_reason key).
    acct_token = await login(client, "acct.pol1@example.com")
    list_resp = await client.get("/policies", headers={"Authorization": f"Bearer {acct_token}"})
    assert list_resp.status_code == 200
    assert list_resp.json()["accessLevel"] == "readonly"
    assert "rejectedReason" not in list_resp.json()["data"][0]

    get_resp = await client.get(f"/policies/{policy_id}", headers={"Authorization": f"Bearer {acct_token}"})
    assert get_resp.status_code == 200
    assert get_resp.json()["accessLevel"] == "readonly"
    assert "rejectedReason" not in get_resp.json()["data"]

    # The creating HOI sees their own policy in full.
    hoi_get_resp = await client.get(f"/policies/{policy_id}", headers={"Authorization": f"Bearer {hoi_token}"})
    assert hoi_get_resp.status_code == 200
    assert hoi_get_resp.json()["accessLevel"] == "full"


async def test_only_chairman_can_approve_and_only_once(client, db_session):
    await make_user(db_session, employee_id="POL103", email="hoi.pol2@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="POL104", email="chair.pol2@example.com", role="CHAIRMAN")

    hoi_token = await login(client, "hoi.pol2@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "Policy X", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = create_resp.json()["data"]["id"]

    # HOI cannot approve their own policy.
    self_approve = await client.patch(
        f"/policies/{policy_id}", json={"policyApprovalStatus": "APPROVED"}, headers={"Authorization": f"Bearer {hoi_token}"}
    )
    assert self_approve.status_code == 403

    chair_token = await login(client, "chair.pol2@example.com")
    approve_resp = await client.patch(
        f"/policies/{policy_id}", json={"policyApprovalStatus": "APPROVED"}, headers={"Authorization": f"Bearer {chair_token}"}
    )
    assert approve_resp.status_code == 200
    assert approve_resp.json()["data"]["policyApprovalStatus"] == "APPROVED"

    # Once decided, it's final.
    second_attempt = await client.patch(
        f"/policies/{policy_id}", json={"policyApprovalStatus": "REJECTED"}, headers={"Authorization": f"Bearer {chair_token}"}
    )
    assert second_attempt.status_code == 400


async def test_reject_requires_reason(client, db_session):
    await make_user(db_session, employee_id="POL105", email="hoi.pol3@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="POL106", email="chair.pol3@example.com", role="CHAIRMAN")

    hoi_token = await login(client, "hoi.pol3@example.com")
    create_resp = await client.post(
        "/policies", data={"title": "Policy Y", "description": "Desc"}, headers={"Authorization": f"Bearer {hoi_token}"}
    )
    policy_id = create_resp.json()["data"]["id"]

    chair_token = await login(client, "chair.pol3@example.com")
    resp = await client.patch(
        f"/policies/{policy_id}", json={"policyApprovalStatus": "REJECTED"}, headers={"Authorization": f"Bearer {chair_token}"}
    )
    assert resp.status_code == 400
