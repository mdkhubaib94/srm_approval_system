from tests.factories import make_user


async def _login(client, email, password):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    return resp.json()["accessToken"]


async def test_get_me_returns_current_user(client, db_session):
    await make_user(db_session, employee_id="EMP500", email="me@example.com", password="secret123")
    token = await _login(client, "me@example.com", "secret123")

    response = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    assert response.json()["email"] == "me@example.com"


async def test_get_me_without_token_is_unauthorized(client):
    response = await client.get("/users/me")
    assert response.status_code == 401


async def test_update_me_lets_requester_change_department(client, db_session):
    await make_user(db_session, employee_id="EMP501", email="dept@example.com", password="secret123", role="REQUESTER")
    token = await _login(client, "dept@example.com", "secret123")

    response = await client.patch(
        "/users/me", json={"department": "Physics"}, headers={"Authorization": f"Bearer {token}"}
    )

    assert response.status_code == 200
    assert response.json()["department"] == "Physics"


async def test_non_manager_role_cannot_list_users(client, db_session):
    await make_user(db_session, employee_id="EMP502", email="plain@example.com", password="secret123", role="ACCOUNTANT")
    token = await _login(client, "plain@example.com", "secret123")

    response = await client.get("/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 403


async def test_head_of_institution_only_sees_own_institution_users(client, db_session):
    await make_user(
        db_session,
        employee_id="EMP503",
        email="hoi@example.com",
        password="secret123",
        role="HEAD_OF_INSTITUTION",
        institution="EEC",
    )
    await make_user(
        db_session,
        employee_id="EMP504",
        email="req.eec@example.com",
        password="secret123",
        role="REQUESTER",
        institution="EEC",
        department="Physics",
    )
    await make_user(
        db_session,
        employee_id="EMP505",
        email="req.dental@example.com",
        password="secret123",
        role="REQUESTER",
        institution="DENTAL",
        department="Physics",
    )
    token = await _login(client, "hoi@example.com", "secret123")

    response = await client.get("/users", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 200
    emails = {u["email"] for u in response.json()}
    assert "req.eec@example.com" in emails
    assert "req.dental@example.com" not in emails


async def test_head_of_institution_cannot_create_chairman(client, db_session):
    await make_user(
        db_session,
        employee_id="EMP506",
        email="hoi2@example.com",
        password="secret123",
        role="HEAD_OF_INSTITUTION",
        institution="EEC",
    )
    token = await _login(client, "hoi2@example.com", "secret123")

    response = await client.post(
        "/users",
        json={"name": "Sneaky", "employeeID": "EMP600", "email": "sneaky@example.com", "role": "CHAIRMAN"},
        headers={"Authorization": f"Bearer {token}"},
    )

    assert response.status_code == 403


async def test_user_cannot_delete_own_account(client, db_session):
    user = await make_user(
        db_session, employee_id="EMP507", email="chairman@example.com", password="secret123", role="CHAIRMAN"
    )
    token = await _login(client, "chairman@example.com", "secret123")

    response = await client.delete(f"/users/{user.id}", headers={"Authorization": f"Bearer {token}"})

    assert response.status_code == 400
