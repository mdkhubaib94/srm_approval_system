from tests.factories import make_user


async def test_register_without_otp_succeeds(client):
    register_resp = await client.post(
        "/auth/register",
        json={
            "name": "New User",
            "employeeID": "EMP300",
            "email": "newuser@example.com",
            "password": "secret123",
        },
    )
    assert register_resp.status_code == 201
    assert register_resp.json()["user"]["role"] == "REQUESTER"


async def test_register_rejects_privileged_self_assigned_role(client):
    response = await client.post(
        "/auth/register",
        json={
            "name": "Wannabe Chairman",
            "employeeID": "EMP302",
            "email": "privileged@example.com",
            "password": "secret123",
            "role": "CHAIRMAN",
        },
    )
    assert response.status_code == 403


async def test_register_rejects_duplicate_email(client, db_session):
    await make_user(db_session, employee_id="EMP303", email="existing@example.com")

    response = await client.post(
        "/auth/register",
        json={
            "name": "Existing",
            "employeeID": "EMP304",
            "email": "existing@example.com",
            "password": "secret123",
        },
    )
    assert response.status_code == 409


async def test_signup_otp_endpoints_are_gone(client):
    response = await client.post("/auth/send-signup-otp", json={"email": "x@example.com", "name": "X"})
    assert response.status_code == 404
