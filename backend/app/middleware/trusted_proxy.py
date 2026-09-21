"""Restore the real client IP (and scheme) from X-Forwarded-* headers when
the request came through a trusted reverse proxy. Port of server.js's
`app.set("trust proxy", 1)`, which made Express honor X-Forwarded-For for
req.ip and X-Forwarded-Proto for req.secure — both of which
rateLimiters.js and cookieSecurity.js relied on.

Implemented as ordinary Starlette middleware rather than uvicorn's
--proxy-headers CLI flag / ProxyHeadersMiddleware ASGI wrapper, so the trust
decision travels with the app regardless of how it's launched (uvicorn CLI,
gunicorn+uvicorn workers, the test suite's ASGITransport, ...) and `app`
stays a plain FastAPI instance for `app.dependency_overrides` in tests —
wrapping the ASGI callable itself would hide that attribute.

Trust is opt-in (see Settings.trusted_proxy_ips): with no trusted proxies
configured, this middleware is a no-op and `request.client` is left as the
raw TCP peer, same as today.
"""

import ipaddress

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from app.config import get_settings


def _is_trusted(client_host: str | None, trusted: list[str]) -> bool:
    if not client_host or not trusted:
        return False
    if "*" in trusted:
        return True
    try:
        addr = ipaddress.ip_address(client_host)
    except ValueError:
        return False
    for entry in trusted:
        try:
            if addr in ipaddress.ip_network(entry, strict=False):
                return True
        except ValueError:
            continue
    return False


class TrustedProxyMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._trusted = get_settings().trusted_proxy_ips

    async def dispatch(self, request: Request, call_next) -> Response:
        client = request.scope.get("client")
        client_host = client[0] if client else None

        if _is_trusted(client_host, self._trusted):
            forwarded_for = request.headers.get("x-forwarded-for")
            if forwarded_for:
                # The first entry is the original client; anything after it
                # was appended by intermediate proxies we don't need to trust.
                real_ip = forwarded_for.split(",")[0].strip()
                if real_ip:
                    request.scope["client"] = (real_ip, 0)

            forwarded_proto = request.headers.get("x-forwarded-proto")
            if forwarded_proto:
                request.scope["scheme"] = forwarded_proto.split(",")[0].strip()

        return await call_next(request)
