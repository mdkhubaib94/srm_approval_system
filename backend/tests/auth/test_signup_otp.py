from app.auth import otp as otp_module
from tests.factories import make_user


async def test_send_verify_register_flow(client):
    send_resp = await client.post("/auth/send-signup-otp", json={"email": "newuser@example.com", "name": "New User"})
    assert send_resp.status_code == 200

    otp = otp_module._otp_store["newuser@example.com"].otp

    verify_resp = await client.post("/auth/verify-signup-otp", json={"email": "newuser@example.com", "otp": otp})
    assert verify_resp.status_code == 200

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


async def test_register_without_verified_otp_is_forbidden(client):
    response = await client.post(
        "/auth/register",
        json={
            "name": "No OTP",
            "employeeID": "EMP301",
            "email": "noverify@example.com",
            "password": "secret123",
        },
    )
    assert response.status_code == 403


async def test_register_rejects_privileged_self_assigned_role(client):
    otp_module.mark_email_verified("privileged@example.com")

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


async def test_signup_otp_blocked_if_email_already_registered(client, db_session):
    await make_user(db_session, employee_id="EMP303", email="existing@example.com")

    response = await client.post("/auth/send-signup-otp", json={"email": "existing@example.com", "name": "Existing"})
    assert response.status_code == 409


async def test_verify_signup_otp_wrong_code_decrements_attempts(client):
    await client.post("/auth/send-signup-otp", json={"email": "attempts@example.com", "name": "Attempts"})

    response = await client.post("/auth/verify-signup-otp", json={"email": "attempts@example.com", "otp": "000000"})
    assert response.status_code == 400
    assert "4 attempts remaining" in response.json()["message"]


async def test_resend_signup_otp_respects_cooldown(client):
    first = await client.post("/auth/send-signup-otp", json={"email": "cooldown@example.com", "name": "Cooldown"})
    assert first.status_code == 200

    second = await client.post("/auth/resend-signup-otp", json={"email": "cooldown@example.com", "name": "Cooldown"})
    assert second.status_code == 429
