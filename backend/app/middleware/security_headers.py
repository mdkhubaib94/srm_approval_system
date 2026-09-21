"""Security response headers — helmet-equivalent. Port of server.js's
`app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }))`.

crossOriginResourcePolicy is relaxed to "cross-origin" for the same reason
as the source: the frontend is served from a different origin than this
API, and the default same-origin policy would let browsers block the
frontend from reading responses (a stricter failure mode than CORS, and one
CORSMiddleware alone does not cover).

No Content-Security-Policy: this is a pure JSON API that serves no HTML, so
a CSP has no content to constrain — helmet ships one by default, but it
exists to constrain a page's own script/style/frame sources, which is moot
here. The file-download endpoint already forces its own
Content-Type/nosniff/Content-Disposition per response (see
app/files/router.py) rather than relying on a blanket policy.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "X-DNS-Prefetch-Control": "off",
    "X-Download-Options": "noopen",
    "X-Permitted-Cross-Domain-Policies": "none",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
}


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)
        for name, value in _SECURITY_HEADERS.items():
            response.headers.setdefault(name, value)
        return response
