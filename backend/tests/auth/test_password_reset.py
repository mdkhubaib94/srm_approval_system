from app.auth import otp as otp_module
from tests.factories import make_user


async def test_full_password_reset_flow(client, db_session):
    await make_user(db_session, employee_id="EMP400", email="reset@example.com", password="oldpassword1")

    forgot_resp = await client.post("/auth/forgot-password", json={"email": "reset@example.com"})
    assert forgot_resp.status_code == 200

    otp = otp_module._otp_store["reset@example.com"].otp
    verify_resp = await client.post("/auth/verify-reset-otp", json={"email": "reset@example.com", "otp": otp})
    assert verify_resp.status_code == 200
    reset_token = verify_resp.json()["resetToken"]
    assert "resetToken" in verify_resp.cookies

    reset_resp = await client.post(
        "/auth/reset-password",
        json={"email": "reset@example.com", "newPassword": "newpassword1", "resetToken": reset_token},
    )
    assert reset_resp.status_code == 200

    old_login = await client.post("/auth/login", json={"email": "reset@example.com", "password": "oldpassword1"})
    assert old_login.status_code == 401

    new_login = await client.post("/auth/login", json={"email": "reset@example.com", "password": "newpassword1"})
    assert new_login.status_code == 200


async def test_forgot_password_neutral_response_for_unknown_email(client):
    response = await client.post("/auth/forgot-password", json={"email": "unknown@example.com"})
    assert response.status_code == 200
    assert response.json()["message"] == "If the email exists, an OTP has been sent."


async def test_forgot_password_trims_whitespace_before_lookup(client, db_session):
    """A stray leading/trailing space in the submitted email must not make an
    existing account look unknown."""
    await make_user(db_session, employee_id="EMP403", email="trim@example.com", password="somepassword1")

    padded_email = "  trim@example.com  "
    response = await client.post("/auth/forgot-password", json={"email": padded_email})
    assert response.status_code == 200
    assert padded_email in otp_module._otp_store


async def test_reset_token_dies_once_password_already_changed(client, db_session):
    """A reset token embeds a fingerprint of the password hash at issuance;
    once the password changes, replaying the same token must fail."""
    await make_user(db_session, employee_id="EMP401", email="replay@example.com", password="firstpassword1")

    await client.post("/auth/forgot-password", json={"email": "replay@example.com"})
    otp = otp_module._otp_store["replay@example.com"].otp
    verify_resp = await client.post("/auth/verify-reset-otp", json={"email": "replay@example.com", "otp": otp})
    reset_token = verify_resp.json()["resetToken"]

    first_reset = await client.post(
        "/auth/reset-password",
        json={"email": "replay@example.com", "newPassword": "secondpassword1", "resetToken": reset_token},
    )
    assert first_reset.status_code == 200

    replay = await client.post(
        "/auth/reset-password",
        json={"email": "replay@example.com", "newPassword": "thirdpassword1", "resetToken": reset_token},
    )
    assert replay.status_code == 401
    assert "already been used" in replay.json()["message"]
