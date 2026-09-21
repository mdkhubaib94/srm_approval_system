from tests.api_helpers import create_mou_request, login
from tests.factories import make_user


async def test_query_raise_pauses_and_resolve_resumes_sla_clock(client, db_session):
    await make_user(db_session, employee_id="QRY100", email="req.qry1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="QRY101", email="im.qry1@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.qry1@example.com")
    created = await create_mou_request(client, req_token)
    request_db_id = created["id"]

    im_token = await login(client, "im.qry1@example.com")
    raise_resp = await client.post(
        "/queries",
        json={"request": str(request_db_id), "query": "Please clarify the budget line."},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert raise_resp.status_code == 201, raise_resp.text
    query_id = raise_resp.json()["data"]["id"]

    # Parent request status flips to QUERY, halting the approval clock.
    get_resp = await client.get(f"/requests/{created['requestID']}", headers={"Authorization": f"Bearer {req_token}"})
    assert get_resp.json()["status"] == "QUERY"

    # Only the stage holder may raise a query — a second IM-role user without
    # institution match, or the requester themself, may not.
    raise_by_requester = await client.post(
        "/queries",
        json={"request": str(request_db_id), "query": "Self-raised?"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert raise_by_requester.status_code == 403

    # Requester answers; resolving the last open query returns request to PENDING.
    resolve_resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Budget line clarified.", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resolve_resp.status_code == 200, resolve_resp.text
    assert resolve_resp.json()["data"]["queryResolved"] is True

    get_resp_2 = await client.get(f"/requests/{created['requestID']}", headers={"Authorization": f"Bearer {req_token}"})
    assert get_resp_2.json()["status"] == "PENDING"


async def test_resolving_last_query_emails_the_current_stage_holder(client, db_session, _stub_mail_transport):
    await make_user(db_session, employee_id="QRY109", email="req.qry5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="QRY110", email="im.qry5@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.qry5@example.com")
    created = await create_mou_request(client, req_token)
    request_db_id = created["id"]

    im_token = await login(client, "im.qry5@example.com")
    raise_resp = await client.post(
        "/queries",
        json={"request": str(request_db_id), "query": "Please clarify the budget line."},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    query_id = raise_resp.json()["data"]["id"]

    _stub_mail_transport.clear()

    resolve_resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Budget line clarified.", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resolve_resp.status_code == 200, resolve_resp.text

    # The request is still sitting at the INSTITUTION_MANAGER stage, so that
    # stage holder — not the requester who resolved the query — is emailed
    # to forward it onward.
    assert len(_stub_mail_transport) == 1
    sent = _stub_mail_transport[0]
    assert sent["to"] == ["im.qry5@example.com"]
    assert "Queries Replied To" in sent["subject"]
    assert "forward" in sent["html"].lower()


async def test_resolving_one_of_two_open_queries_keeps_request_in_query_status(client, db_session):
    await make_user(db_session, employee_id="QRY102", email="req.qry2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="QRY103", email="im.qry2@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.qry2@example.com")
    created = await create_mou_request(client, req_token)
    request_db_id = created["id"]

    im_token = await login(client, "im.qry2@example.com")
    first = await client.post(
        "/queries", json={"request": str(request_db_id), "query": "Question 1"}, headers={"Authorization": f"Bearer {im_token}"}
    )
    second = await client.post(
        "/queries", json={"request": str(request_db_id), "query": "Question 2"}, headers={"Authorization": f"Bearer {im_token}"}
    )
    assert first.status_code == 201 and second.status_code == 201

    resolve_first = await client.patch(
        f"/queries/{first.json()['data']['id']}",
        data={"query_reply": "Answer 1", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resolve_first.status_code == 200

    still_query = await client.get(f"/requests/{created['requestID']}", headers={"Authorization": f"Bearer {req_token}"})
    assert still_query.json()["status"] == "QUERY"

    resolve_second = await client.patch(
        f"/queries/{second.json()['data']['id']}",
        data={"query_reply": "Answer 2", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resolve_second.status_code == 200

    back_to_pending = await client.get(f"/requests/{created['requestID']}", headers={"Authorization": f"Bearer {req_token}"})
    assert back_to_pending.json()["status"] == "PENDING"


async def test_unrelated_user_cannot_reply_to_query(client, db_session):
    await make_user(db_session, employee_id="QRY104", email="req.qry3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="QRY105", email="im.qry3@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="QRY106", email="outsider.qry3@example.com", role="REQUESTER", institution="DENTAL", department="Physics")

    req_token = await login(client, "req.qry3@example.com")
    created = await create_mou_request(client, req_token)

    im_token = await login(client, "im.qry3@example.com")
    raise_resp = await client.post(
        "/queries", json={"request": str(created["id"]), "query": "Question"}, headers={"Authorization": f"Bearer {im_token}"}
    )
    query_id = raise_resp.json()["data"]["id"]

    outsider_token = await login(client, "outsider.qry3@example.com")
    resp = await client.patch(
        f"/queries/{query_id}",
        data={"query_reply": "Not my request", "query_resolved": "true"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert resp.status_code == 404


async def test_create_query_rejects_malformed_query_reply_by(client, db_session):
    """queryReplyBy names the user expected to answer; it must be a real id,
    not an arbitrary value written straight into the row — a malformed value
    should 400 rather than reach the database."""
    await make_user(db_session, employee_id="QRY107", email="req.qry4@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="QRY108", email="im.qry4@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.qry4@example.com")
    created = await create_mou_request(client, req_token)

    im_token = await login(client, "im.qry4@example.com")
    resp = await client.post(
        "/queries",
        json={"request": str(created["id"]), "query": "Question", "queryReplyBy": "not-an-id"},
        headers={"Authorization": f"Bearer {im_token}"},
    )
    assert resp.status_code == 400
