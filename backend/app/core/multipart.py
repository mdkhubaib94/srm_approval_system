"""A handful of Express routes in the source ran both express.json() (global)
and multer (per-route) — Express dispatches body-parsing by Content-Type, so
the *same* route genuinely accepted either a JSON body or multipart/form-data
depending on what the caller sent (JSON when there were no files to attach,
multipart when there were). FastAPI's `Form(...)` params have no equivalent:
they only ever read a multipart/urlencoded body. Routes that need this same
either-or behavior parse the raw request with this helper instead of
declaring Form/File parameters.
"""

import json

from fastapi import HTTPException, Request, UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile

from app.files.validation import StagedFileRef


def parse_staged_file_refs(raw) -> list[StagedFileRef]:
    """`attachmentFileIds`: ids from POST /uploads/stage, as a JSON list (JSON
    body) or a JSON-encoded string (multipart field)."""
    if raw in (None, ""):
        return []
    try:
        ids = json.loads(raw) if isinstance(raw, str) else raw
        return [StagedFileRef(int(i)) for i in ids]
    except (TypeError, ValueError):
        raise HTTPException(400, "attachmentFileIds must be a list of uploaded file ids")


async def parse_form_or_json(request: Request) -> tuple[dict, list[UploadFile]]:
    """Returns (scalar_fields, uploaded_files). `attachments` file fields are
    collected into the second element; every other field (from either a
    multipart form or a JSON body) goes into the first, values left as
    whatever the source sent (strings for form fields, native types for JSON)."""
    content_type = request.headers.get("content-type", "")

    if content_type.startswith("multipart/form-data") or content_type.startswith("application/x-www-form-urlencoded"):
        form = await request.form()
        fields: dict = {}
        files: list[UploadFile] = []
        for key, value in form.multi_items():
            # request.form() (a Starlette method — FastAPI doesn't override
            # it) builds plain starlette.datastructures.UploadFile instances,
            # not fastapi.UploadFile (a subclass) — check against the base
            # class, or every upload silently falls into `fields` instead.
            if isinstance(value, StarletteUploadFile):
                files.append(value)
            else:
                fields[key] = value
        files.extend(parse_staged_file_refs(fields.get("attachmentFileIds")))
        return fields, files

    body = await request.body()
    if not body:
        return {}, []
    parsed = json.loads(body)
    fields = parsed if isinstance(parsed, dict) else {}
    return fields, parse_staged_file_refs(fields.get("attachmentFileIds"))
