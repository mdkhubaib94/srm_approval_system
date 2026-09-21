"""Transforms every JSON response from this codebase's internal snake_case
into the camelCase (plus Mongo-style `_id`) shape the frontend was written
against — restoring what the original Node/Mongoose API actually produced
on the wire, which the migration's flat/snake_case internals don't produce
by themselves. See app/core/case_conversion.py for the key-conversion rules
and their handful of explicit overrides (SOP, requestID, ...).

Runs on the full response body rather than at each call site's dict
construction — there are too many of those across the app to keep in sync
by hand, and this keeps the internal (snake_case) and external (camelCase)
contracts cleanly separated.
"""

import json

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

from app.core.case_conversion import snake_to_camel


def _transform(value):
    if isinstance(value, dict):
        transformed = {snake_to_camel(key): _transform(val) for key, val in value.items()}
        # Mongo-style `_id` alongside the real `id` — the frontend was
        # written against the original Mongo-backed API and reads `_id`
        # everywhere. Mirrored, not renamed, so nothing here depends on
        # only one of the two spellings being present.
        if "id" in value and not isinstance(value["id"], (dict, list)):
            transformed["_id"] = value["id"]
        return transformed
    if isinstance(value, list):
        return [_transform(item) for item in value]
    return value


class CamelCaseResponseMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        content_type = response.headers.get("content-type", "")
        if not content_type.startswith("application/json"):
            return response

        body = b"".join([section async for section in response.body_iterator])

        try:
            data = json.loads(body)
        except ValueError:
            # Not actually JSON despite the header (shouldn't happen for our
            # own routes) — pass the original bytes through untouched.
            new_body = body
        else:
            new_body = json.dumps(_transform(data)).encode("utf-8")

        new_response = Response(content=new_body, status_code=response.status_code, media_type="application/json")
        # Keep every other original header (in particular Set-Cookie, which
        # a plain dict merge would collapse if more than one were ever
        # present) — only content-length/content-type are recomputed above.
        new_response.raw_headers = [
            (k, v) for k, v in response.raw_headers if k.lower() not in (b"content-length", b"content-type")
        ] + new_response.raw_headers
        return new_response
