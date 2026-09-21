"""Unit tests for TrustedProxyMiddleware. Exercised directly against the
middleware/Request objects (rather than through the `client`/`app` fixtures)
because the middleware reads Settings.trusted_proxy_ips once at construction
time — matching how it behaves in the real, single-process app, where the
env var is fixed for the process lifetime — so it isn't something a
per-test monkeypatch of get_settings() could reach once `app` is built.
"""

from starlette.requests import Request
from starlette.responses import PlainTextResponse

from app.middleware.trusted_proxy import TrustedProxyMiddleware, _is_trusted


def test_is_trusted_wildcard():
    assert _is_trusted("203.0.113.5", ["*"]) is True


def test_is_trusted_exact_ip():
    assert _is_trusted("203.0.113.5", ["203.0.113.5"]) is True
    assert _is_trusted("203.0.113.6", ["203.0.113.5"]) is False


def test_is_trusted_cidr():
    assert _is_trusted("10.0.0.42", ["10.0.0.0/8"]) is True
    assert _is_trusted("192.168.1.1", ["10.0.0.0/8"]) is False


def test_is_trusted_empty_or_missing():
    assert _is_trusted("10.0.0.1", []) is False
    assert _is_trusted(None, ["*"]) is False


def _make_request(client_host: str, headers: dict[str, str]) -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": [(k.lower().encode(), v.encode()) for k, v in headers.items()],
        "client": (client_host, 12345),
        "scheme": "http",
        "query_string": b"",
    }
    return Request(scope)


async def _call_next(request: Request) -> PlainTextResponse:
    return PlainTextResponse("ok")


async def test_dispatch_rewrites_client_when_peer_is_trusted():
    middleware = TrustedProxyMiddleware.__new__(TrustedProxyMiddleware)
    middleware._trusted = ["10.0.0.1"]

    request = _make_request("10.0.0.1", {"X-Forwarded-For": "203.0.113.9, 10.0.0.1", "X-Forwarded-Proto": "https"})
    await middleware.dispatch(request, _call_next)

    assert request.scope["client"] == ("203.0.113.9", 0)
    assert request.scope["scheme"] == "https"


async def test_dispatch_leaves_client_alone_when_peer_is_not_trusted():
    middleware = TrustedProxyMiddleware.__new__(TrustedProxyMiddleware)
    middleware._trusted = ["10.0.0.1"]

    request = _make_request("198.51.100.7", {"X-Forwarded-For": "203.0.113.9"})
    await middleware.dispatch(request, _call_next)

    assert request.scope["client"] == ("198.51.100.7", 12345)


async def test_dispatch_is_a_no_op_with_no_trusted_proxies_configured():
    middleware = TrustedProxyMiddleware.__new__(TrustedProxyMiddleware)
    middleware._trusted = []

    request = _make_request("10.0.0.1", {"X-Forwarded-For": "203.0.113.9"})
    await middleware.dispatch(request, _call_next)

    assert request.scope["client"] == ("10.0.0.1", 12345)
