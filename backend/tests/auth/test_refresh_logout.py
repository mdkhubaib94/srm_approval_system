from tests.factories import make_user


async def test_refresh_rotates_token_and_returns_new_access_token(client, db_session):
    await make_user(db_session, employee_id="EMP200", email="frank@example.com", password="secret123")
    login = await client.post("/auth/login", json={"email": "frank@example.com", "password": "secret123"})
    old_refresh_cookie = client.cookies.get("jwt")

    refreshed = await client.get("/auth/refresh")

    assert refreshed.status_code == 200
    assert "accessToken" in refreshed.json()
    new_refresh_cookie = client.cookies.get("jwt")
    assert new_refresh_cookie != old_refresh_cookie


async def test_refresh_without_cookie_is_unauthorized(client):
    response = await client.get("/auth/refresh")
    assert response.status_code == 401


async def test_logout_invalidates_captured_refresh_token(client, db_session):
    await make_user(db_session, employee_id="EMP201", email="grace@example.com", password="secret123")
    await client.post("/auth/login", json={"email": "grace@example.com", "password": "secret123"})
    captured_refresh_cookie = client.cookies.get("jwt")

    logout_resp = await client.post("/auth/logout")
    assert logout_resp.status_code == 200

    # Re-attach the captured (now-revoked) cookie and try to use it.
    client.cookies.set("jwt", captured_refresh_cookie)
    replay_resp = await client.get("/auth/refresh")
    assert replay_resp.status_code == 401


async def test_logout_without_cookie_returns_204(client):
    response = await client.post("/auth/logout")
    assert response.status_code == 204
