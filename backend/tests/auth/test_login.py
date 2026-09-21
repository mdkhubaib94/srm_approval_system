from tests.factories import make_user


async def test_login_success_sets_refresh_cookie_and_returns_access_token(client, db_session):
    await make_user(db_session, employee_id="EMP100", email="alice@example.com", password="secret123")

    response = await client.post("/auth/login", json={"email": "alice@example.com", "password": "secret123"})

    assert response.status_code == 200
    body = response.json()
    assert "accessToken" in body and body["accessToken"]
    assert "jwt" in response.cookies


async def test_login_by_employee_id_also_works(client, db_session):
    await make_user(db_session, employee_id="EMP101", email="bob@example.com", password="secret123")

    response = await client.post("/auth/login", json={"email": "EMP101", "password": "secret123"})

    assert response.status_code == 200
    assert "accessToken" in response.json()


async def test_login_wrong_password_returns_generic_message(client, db_session):
    await make_user(db_session, employee_id="EMP102", email="carol@example.com", password="secret123")

    response = await client.post("/auth/login", json={"email": "carol@example.com", "password": "wrong-password"})

    assert response.status_code == 401
    assert response.json() == {"message": "Invalid email/employee ID or password."}


async def test_login_unknown_user_returns_identical_generic_message(client, db_session):
    response = await client.post("/auth/login", json={"email": "nobody@example.com", "password": "whatever123"})

    assert response.status_code == 401
    assert response.json() == {"message": "Invalid email/employee ID or password."}


async def test_login_missing_fields_returns_400(client):
    response = await client.post("/auth/login", json={"email": "", "password": ""})
    assert response.status_code == 400


async def test_chairman_gets_persistent_cookie_others_get_session_cookie(client, db_session):
    await make_user(db_session, employee_id="EMP103", email="chair@example.com", password="secret123", role="CHAIRMAN")
    await make_user(db_session, employee_id="EMP104", email="req@example.com", password="secret123", role="REQUESTER")

    chairman_resp = await client.post("/auth/login", json={"email": "chair@example.com", "password": "secret123"})
    requester_resp = await client.post("/auth/login", json={"email": "req@example.com", "password": "secret123"})

    chairman_cookie_header = chairman_resp.headers.get_list("set-cookie")
    requester_cookie_header = requester_resp.headers.get_list("set-cookie")
    chairman_jwt_line = next(c for c in chairman_cookie_header if c.startswith("jwt="))
    requester_jwt_line = next(c for c in requester_cookie_header if c.startswith("jwt="))

    assert "Max-Age" in chairman_jwt_line
    assert "Max-Age" not in requester_jwt_line


async def test_login_rate_limit_blocks_after_repeated_failures(client, db_session):
    await make_user(db_session, employee_id="EMP105", email="dave@example.com", password="secret123")

    for _ in range(10):
        resp = await client.post("/auth/login", json={"email": "dave@example.com", "password": "wrong"})
        assert resp.status_code == 401

    blocked = await client.post("/auth/login", json={"email": "dave@example.com", "password": "wrong"})
    assert blocked.status_code == 429


async def test_login_rate_limit_does_not_count_successful_attempts(client, db_session):
    await make_user(db_session, employee_id="EMP106", email="erin@example.com", password="secret123")

    for _ in range(15):
        resp = await client.post("/auth/login", json={"email": "erin@example.com", "password": "secret123"})
        assert resp.status_code == 200
