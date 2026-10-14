from tests.api_helpers import login
from tests.factories import make_user


async def test_security_headers_present_on_every_response(client):
    resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["x-frame-options"] == "SAMEORIGIN"
    assert resp.headers["cross-origin-resource-policy"] == "cross-origin"
    assert "strict-transport-security" in resp.headers


async def test_security_headers_present_on_error_responses_too(client):
    resp = await client.get("/users/me")  # unauthenticated -> 401
    assert resp.status_code == 401
    assert resp.headers["x-content-type-options"] == "nosniff"


async def test_health_ping_and_root_are_never_rate_limited(client):
    for _ in range(10):
        resp = await client.get("/ping")
        assert resp.status_code == 200


async def test_oversized_json_body_is_rejected(client, db_session, monkeypatch):
    from app.middleware import body_size_limit

    # Shrink the cap so the test doesn't have to ship 100MB.
    monkeypatch.setattr(body_size_limit, "JSON_BODY_LIMIT_BYTES", 100 * 1024)

    await make_user(db_session, employee_id="HARD100", email="req.hard1@example.com", role="REQUESTER")
    token = await login(client, "req.hard1@example.com")

    # Comfortably over the JSON body cap (app/middleware/body_size_limit.py)
    # — httpx computes the real Content-Length from this payload itself, no
    # need to fake the header.
    huge_query_text = "x" * (250 * 1024)
    resp = await client.post(
        "/queries",
        json={"request": "1", "query": huge_query_text},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 413


async def test_multipart_upload_is_not_subject_to_json_body_cap(client, db_session):
    """The JSON body cap must not apply to multipart/form-data — file uploads
    are validated separately (10MB/file) in app/files/validation.py."""
    from tests.api_helpers import pdf_upload

    await make_user(db_session, employee_id="HARD101", email="req.hard2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "req.hard2@example.com")

    import json

    resp = await client.post(
        "/requests",
        data={
            "title": "Not too big",
            "department": "Physics",
            "details_model": "MouDetail",
            "details_payload": json.dumps(
                {
                    "legal_opinion_obtained": True,
                    "mou_type": "Fresh",
                    "organisation_name": "Acme",
                    "organisation_type": "Software",
                    "domain_or_products": "Tooling",
                    "validity_from": "2025-01-01",
                    "validity_to": "2026-01-01",
                }
            ),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201


async def test_global_rate_limit_eventually_blocks_high_volume_callers(client, db_session):
    from app.core import rate_limit as rate_limit_module

    await make_user(db_session, employee_id="HARD102", email="req.hard3@example.com", role="REQUESTER")
    token = await login(client, "req.hard3@example.com")

    # Lower the ceiling for this test rather than firing 300 real requests.
    original_limit = rate_limit_module.api_limiter.limit
    rate_limit_module.api_limiter.limit = 5
    try:
        statuses = []
        for _ in range(7):
            resp = await client.get("/users/me", headers={"Authorization": f"Bearer {token}"})
            statuses.append(resp.status_code)
        assert 429 in statuses
    finally:
        rate_limit_module.api_limiter.limit = original_limit
