async def test_signup_otp_endpoints_are_gone(client):
    response = await client.post("/auth/send-signup-otp", json={"email": "x@example.com", "name": "X"})
    assert response.status_code == 404
