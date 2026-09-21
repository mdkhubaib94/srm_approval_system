from tests.api_helpers import login
from tests.factories import make_user

MOU_FIELDS = [
    {"name": "organisationName", "label": "Organisation Name", "type": "text", "required": True},
    {
        "name": "domainOrProducts",
        "label": "Domain/Products",
        "type": "select",
        "options": ["Manufacturing", "Software", "Others"],
        "required": True,
        "validation": {"regex": "^[A-Za-z ]+$"},
    },
]


async def test_only_chairman_office_can_create_form_config(client, db_session):
    await make_user(db_session, employee_id="FC100", email="req.fc1@example.com", role="REQUESTER")
    token = await login(client, "req.fc1@example.com")

    resp = await client.post(
        "/form-configs",
        json={"request_type": "MouDetail", "title": "MOU", "fields": MOU_FIELDS},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_rejects_unknown_request_type(client, db_session):
    await make_user(db_session, employee_id="FC101", email="office.fc1@example.com", role="CHAIRMAN_OFFICE")
    token = await login(client, "office.fc1@example.com")

    resp = await client.post(
        "/form-configs",
        json={"request_type": "NotARealDetail", "title": "Bogus", "fields": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 400


async def test_create_list_get_update_delete_round_trip(client, db_session):
    await make_user(db_session, employee_id="FC102", email="office.fc2@example.com", role="CHAIRMAN_OFFICE")
    await make_user(db_session, employee_id="FC103", email="req.fc2@example.com", role="REQUESTER")
    office_token = await login(client, "office.fc2@example.com")
    requester_token = await login(client, "req.fc2@example.com")

    create_resp = await client.post(
        "/form-configs",
        json={"request_type": "MouDetail", "title": "MOU", "fields": MOU_FIELDS},
        headers={"Authorization": f"Bearer {office_token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    data = create_resp.json()["data"]
    assert data["requestType"] == "MouDetail"
    assert len(data["fields"]) == 2
    assert data["fields"][1]["options"] == ["Manufacturing", "Software", "Others"]
    assert data["fields"][1]["validation"]["regex"] == "^[A-Za-z ]+$"

    # Any authenticated role (not just the manager) can read form configs —
    # they drive the create-request form for every requester.
    list_resp = await client.get("/form-configs", headers={"Authorization": f"Bearer {requester_token}"})
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1

    get_resp = await client.get("/form-configs/MouDetail", headers={"Authorization": f"Bearer {requester_token}"})
    assert get_resp.status_code == 200
    assert get_resp.json()["data"]["title"] == "MOU"

    # Duplicate request_type is rejected.
    dup_resp = await client.post(
        "/form-configs",
        json={"request_type": "MouDetail", "title": "MOU Again", "fields": []},
        headers={"Authorization": f"Bearer {office_token}"},
    )
    assert dup_resp.status_code == 409

    update_resp = await client.patch(
        "/form-configs/MouDetail",
        json={"title": "MOU (updated)", "fields": [MOU_FIELDS[0]]},
        headers={"Authorization": f"Bearer {office_token}"},
    )
    assert update_resp.status_code == 200
    updated = update_resp.json()["data"]
    assert updated["title"] == "MOU (updated)"
    assert len(updated["fields"]) == 1

    delete_resp = await client.delete("/form-configs/MouDetail", headers={"Authorization": f"Bearer {office_token}"})
    assert delete_resp.status_code == 200

    missing_resp = await client.get("/form-configs/MouDetail", headers={"Authorization": f"Bearer {requester_token}"})
    assert missing_resp.status_code == 404
