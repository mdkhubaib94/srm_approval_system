from tests.api_helpers import create_mou_request, login
from tests.factories import make_user


async def test_chairman_can_raise_query_on_pending_policy_and_owner_can_reply(client, db_session):
    await make_user(db_session, employee_id="PQR100", email="hoi.pqr1@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="PQR101", email="chair.pqr1@example.com", role="CHAIRMAN")

    hoi_token = await login(client, "hoi.pqr1@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "Leave Policy", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = create_resp.json()["data"]["id"]

    chair_token = await login(client, "chair.pqr1@example.com")
    raise_resp = await client.post(
        "/queries",
        json={"policy": str(policy_id), "query": "Please clarify the eligibility criteria."},
        headers={"Authorization": f"Bearer {chair_token}"},
    )
    assert raise_resp.status_code == 201, raise_resp.text
    query_id = raise_resp.json()["data"]["id"]
    assert raise_resp.json()["data"]["policy"]["id"] == policy_id
    assert raise_resp.json()["data"]["request"] is None

    # The policy itself never flips status when a query is raised on it.
    get_policy = await client.get(f"/policies/{policy_id}", headers={"Authorization": f"Bearer {hoi_token}"})
    assert get_policy.json()["data"]["policyApprovalStatus"] == "PENDING"
    assert get_policy.json()["data"]["queries"][0]["id"] == query_id

    # The submitting HOI (policy owner) may reply and resolve it.
    resolve_resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Eligibility clarified.", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    assert resolve_resp.status_code == 200, resolve_resp.text
    assert resolve_resp.json()["data"]["queryResolved"] is True


async def test_only_chairman_may_raise_a_policy_query(client, db_session):
    await make_user(db_session, employee_id="PQR102", email="hoi.pqr2@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="PQR103", email="other.pqr2@example.com", role="HEAD_OF_INSTITUTION", institution="DENTAL")

    hoi_token = await login(client, "hoi.pqr2@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "Travel Policy", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = create_resp.json()["data"]["id"]

    other_token = await login(client, "other.pqr2@example.com")
    resp = await client.post(
        "/queries",
        json={"policy": str(policy_id), "query": "Why this cost?"},
        headers={"Authorization": f"Bearer {other_token}"},
    )
    assert resp.status_code == 403


async def test_cannot_raise_query_on_already_decided_policy(client, db_session):
    await make_user(db_session, employee_id="PQR104", email="hoi.pqr3@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="PQR105", email="chair.pqr3@example.com", role="CHAIRMAN")

    hoi_token = await login(client, "hoi.pqr3@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "Remote Work Policy", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = create_resp.json()["data"]["id"]

    chair_token = await login(client, "chair.pqr3@example.com")
    approve_resp = await client.patch(
        f"/policies/{policy_id}", json={"policyApprovalStatus": "APPROVED"}, headers={"Authorization": f"Bearer {chair_token}"}
    )
    assert approve_resp.status_code == 200

    resp = await client.post(
        "/queries",
        json={"policy": str(policy_id), "query": "Too late?"},
        headers={"Authorization": f"Bearer {chair_token}"},
    )
    assert resp.status_code == 403


async def test_unrelated_user_cannot_reply_to_policy_query(client, db_session):
    await make_user(db_session, employee_id="PQR106", email="hoi.pqr4@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="PQR107", email="chair.pqr4@example.com", role="CHAIRMAN")
    await make_user(db_session, employee_id="PQR108", email="outsider.pqr4@example.com", role="REQUESTER", institution="DENTAL")

    hoi_token = await login(client, "hoi.pqr4@example.com")
    create_resp = await client.post(
        "/policies",
        data={"title": "Uniform Policy", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = create_resp.json()["data"]["id"]

    chair_token = await login(client, "chair.pqr4@example.com")
    raise_resp = await client.post(
        "/queries",
        json={"policy": str(policy_id), "query": "Question"},
        headers={"Authorization": f"Bearer {chair_token}"},
    )
    query_id = raise_resp.json()["data"]["id"]

    outsider_token = await login(client, "outsider.pqr4@example.com")
    resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Not mine to answer", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert resp.status_code == 403


async def test_queries_endpoint_unifies_request_and_policy_queries(client, db_session):
    await make_user(db_session, employee_id="PQR109", email="req.pqr5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="PQR110", email="im.pqr5@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="PQR111", email="hoi.pqr5@example.com", role="HEAD_OF_INSTITUTION", institution="EEC")
    await make_user(db_session, employee_id="PQR112", email="chair.pqr5@example.com", role="CHAIRMAN")

    req_token = await login(client, "req.pqr5@example.com")
    created = await create_mou_request(client, req_token)

    im_token = await login(client, "im.pqr5@example.com")
    request_query = await client.post(
        "/queries",
        json={"request": str(created["id"]), "query": "Clarify budget."},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert request_query.status_code == 201

    hoi_token = await login(client, "hoi.pqr5@example.com")
    policy_create = await client.post(
        "/policies",
        data={"title": "Overtime Policy", "description": "Desc"},
        headers={"Authorization": f"Bearer {hoi_token}"},
    )
    policy_id = policy_create.json()["data"]["id"]

    chair_token = await login(client, "chair.pqr5@example.com")
    policy_query = await client.post(
        "/queries",
        json={"policy": str(policy_id), "query": "Clarify overtime rate."},
        headers={"Authorization": f"Bearer {chair_token}"},
    )
    assert policy_query.status_code == 201

    # im_token can see the request query (same institution) and the policy
    # query (policies are globally readable), so both land in one listing.
    listing = await client.get("/queries", headers={"Authorization": f"Bearer {im_token}"})
    assert listing.status_code == 200
    ids = {q["id"] for q in listing.json()["data"]}
    assert request_query.json()["data"]["id"] in ids
    assert policy_query.json()["data"]["id"] in ids


async def test_create_query_requires_exactly_one_parent(client, db_session):
    await make_user(db_session, employee_id="PQR113", email="chair.pqr6@example.com", role="CHAIRMAN")
    chair_token = await login(client, "chair.pqr6@example.com")

    neither = await client.post(
        "/queries", json={"query": "No parent given"}, headers={"Authorization": f"Bearer {chair_token}"}
    )
    assert neither.status_code == 400

    both = await client.post(
        "/queries",
        json={"request": "1", "policy": "1", "query": "Both given"},
        headers={"Authorization": f"Bearer {chair_token}"},
    )
    assert both.status_code == 400
