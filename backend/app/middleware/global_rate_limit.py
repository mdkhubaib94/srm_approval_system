"""Broad backstop rate limit for the whole API. Port of server.js's
`app.use("/", apiLimiter, routes)` — health checks are deliberately mounted
before this and so are not rate limited, same as the source.
"""

from fastapi import HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.rate_limit import api_limiter

_EXEMPT_PATHS = {"/health", "/ping", "/"}


class GlobalRateLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        if request.url.path in _EXEMPT_PATHS:
            return await call_next(request)

        try:
            api_limiter.check(request)
        except HTTPException as exc:
            return JSONResponse(status_code=exc.status_code, content={"success": False, "message": exc.detail})

        return await call_next(request)
