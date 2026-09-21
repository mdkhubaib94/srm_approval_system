import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.core.multipart import parse_form_or_json
from app.db.session import get_db
from app.files.storage import read_bytes
from app.files import service

router = APIRouter(prefix="/uploads", tags=["uploads"])

_UNSAFE_FILENAME_CHARS = re.compile(r"[^\w.\- ]+")


def _raise(exc: service.FilesServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.post("/requests/{request_id}/attachments")
async def upload_request_attachments(
    request_id: int,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # The source accepted files under either the "attachments" or "file"
    # multipart field name (upload.fields([...])); parse_form_or_json
    # collects every file part regardless of field name, reproducing that
    # same either-or acceptance instead of binding one fixed field name.
    _fields, attachments = await parse_form_or_json(http_request)
    try:
        return await service.upload_request_attachments(db, current_user, request_id, attachments)
    except service.FilesServiceError as exc:
        _raise(exc)


@router.get("/files/{file_id}")
async def download_file(file_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        stored_file = await service.get_downloadable_file(db, current_user, file_id)
    except service.FilesServiceError as exc:
        _raise(exc)

    content = read_bytes(stored_file.path_on_disk)

    # Never echo the stored content type back — it came from the uploader.
    # Everything here is a PDF, and it is served as a download so the browser
    # never renders it as active content in this origin's context.
    safe_name = _UNSAFE_FILENAME_CHARS.sub("_", stored_file.original_filename or "document.pdf")
    return Response(
        content=content,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}"',
            "X-Content-Type-Options": "nosniff",
        },
    )
