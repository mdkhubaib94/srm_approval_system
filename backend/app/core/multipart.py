"""A handful of Express routes in the source ran both express.json() (global)
and multer (per-route) — Express dispatches body-parsing by Content-Type, so
the *same* route genuinely accepted either a JSON body or multipart/form-data
depending on what the caller sent (JSON when there were no files to attach,
multipart when there were). FastAPI's `Form(...)` params have no equivalent:
they only ever read a multipart/urlencoded body. Routes that need this same
either-or behavior parse the raw request with this helper instead of
declaring Form/File parameters.
"""

from fastapi import Request, UploadFile
from starlette.datastructures import UploadFile as StarletteUploadFile


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
        return fields, files

    body = await request.body()
    if not body:
        return {}, []
    import json

    parsed = json.loads(body)
    return (parsed if isinstance(parsed, dict) else {}), []
