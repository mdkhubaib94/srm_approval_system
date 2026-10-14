"""Cap non-multipart request bodies. Originally a port of server.js's
`express.json({ limit: "200kb" })`; raised to 100 MB so large JSON payloads
(e.g. bulk user imports) are not rejected with 413.

Only applies to JSON/form-urlencoded bodies — multipart/form-data (file
uploads) has no size limit (only a 20 files/request cap in
app/files/validation.py), same layering as the source (multer's own
limits, separate from the body-parser cap that would otherwise reject an
upload outright).
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

JSON_BODY_LIMIT_BYTES = 100 * 1024 * 1024


class BodySizeLimitMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("multipart/form-data"):
            return await call_next(request)

        content_length = request.headers.get("content-length")
        if content_length is not None:
            try:
                size = int(content_length)
            except ValueError:
                size = None
            if size is not None and size > JSON_BODY_LIMIT_BYTES:
                return JSONResponse(status_code=413, content={"message": "Request body too large."})

        return await call_next(request)
