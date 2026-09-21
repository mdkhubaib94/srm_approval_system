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


async def _login(client, email, password="secret123"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["accessToken"]


async def test_create_mou_request_derives_research_category(client, db_session):
    await make_user(
        db_session, employee_id="REQ100", email="requester1@example.com", role="REQUESTER", institution="EEC", department="Physics"
    )
    token = await _login(client, "requester1@example.com")

    response = await client.post(
        "/requests",
        data={
            "title": "MOU with Acme",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201, response.text
    body = response.json()
    assert body["requestCategory"] == "RESEARCH"
    assert body["stage"] == "INSTITUTION_MANAGER"
    assert body["status"] == "PENDING"
    assert body["details"]["organisationName"] == "Acme Labs"
    assert len(body["actionHistory"]) == 1
    assert body["actionHistory"][0]["action"] == "created"


async def test_create_request_requires_at_least_one_attachment(client, db_session):
    await make_user(
        db_session, employee_id="REQ101", email="requester2@example.com", role="REQUESTER", institution="EEC", department="Physics"
    )
    token = await _login(client, "requester2@example.com")

    response = await client.post(
        "/requests",
        data={
            "title": "MOU with Acme",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
    assert "attachment" in response.json()["detail"].lower()


async def test_create_request_rejects_non_pdf_upload(client, db_session):
    await make_user(
        db_session, employee_id="REQ102", email="requester3@example.com", role="REQUESTER", institution="EEC", department="Physics"
    )
    token = await _login(client, "requester3@example.com")

    response = await client.post(
        "/requests",
        data={
            "title": "MOU with Acme",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
        },
        files=[("attachments", ("not-a-pdf.txt", b"hello world", "text/plain"))],
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400


async def test_client_cannot_choose_own_request_category(client, db_session):
    """requestCategory is never accepted from the client — only detailsModel
    (+ generalCategory for GeneralDetail) determines it."""
    await make_user(
        db_session, employee_id="REQ103", email="requester4@example.com", role="REQUESTER", institution="EEC", department="Physics"
    )
    token = await _login(client, "requester4@example.com")

    response = await client.post(
        "/requests",
        data={
            "title": "MOU with Acme",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(MOU_PAYLOAD),
            "requestCategory": "ADMIN_HR",  # attempted override — must be ignored
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 201
    assert response.json()["requestCategory"] == "RESEARCH"


async def test_create_request_unknown_details_model_is_rejected(client, db_session):
    await make_user(
        db_session, employee_id="REQ104", email="requester5@example.com", role="REQUESTER", institution="EEC", department="Physics"
    )
    token = await _login(client, "requester5@example.com")

    response = await client.post(
        "/requests",
        data={
            "title": "Some request",
            "department": "Physics",
            "details_model": "TotallyMadeUpDetail",
            "details_payload": json.dumps({}),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 400
