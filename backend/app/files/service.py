"""Business logic for file uploads/downloads. Reference: src/controllers/uploadController.js."""

from fastapi import UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import CurrentUser
from app.db.helpers import get_with_options
from app.files.access import can_access_file
from app.files.models import StoredFile
from app.files.storage import save_bytes
from app.files.validation import MAX_FILES_PER_REQUEST, InvalidUploadError, assert_pdf
from app.files import repository as repo
from app.requests.access import can_attach_to_request, can_view_request
from app.requests.models import Request, RequestActionHistory


class FilesServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def store_uploaded_files(db: AsyncSession, files: list[UploadFile], *, uploaded_by_id: int | None) -> list[StoredFile]:
    """Validate (PDF-only, magic-byte checked, size/count limited) and
    persist a batch of uploads: bytes to local disk, metadata as StoredFile
    rows. Raises InvalidUploadError on the first invalid file — mirrors the
    source's assertPdfContents/wrapUpload, which validates every file before
    any of them is written to permanent storage.
    """
    if len(files) > MAX_FILES_PER_REQUEST:
        raise InvalidUploadError(f"No more than {MAX_FILES_PER_REQUEST} files are allowed.")

    contents: list[bytes] = []
    for f in files:
        content = await f.read()
        assert_pdf(f.filename or "", f.content_type, content)
        contents.append(content)

    stored: list[StoredFile] = []
    for f, content in zip(files, contents):
        path_on_disk = save_bytes(content)
        record = StoredFile(
            path_on_disk=path_on_disk,
            original_filename=f.filename or "document.pdf",
            mimetype=f.content_type or "application/pdf",
            size_bytes=len(content),
            uploaded_by_id=uploaded_by_id,
        )
        repo.add_stored_file(db, record)
        stored.append(record)

    await repo.flush(db)
    return stored


async def upload_request_attachments(
    db: AsyncSession, current_user: CurrentUser, request_id: int, attachments: list[UploadFile]
) -> dict:
    request = await get_with_options(
        db, Request, request_id, selectinload(Request.action_history).selectinload(RequestActionHistory.action_by)
    )
    if request is None:
        raise FilesServiceError(404, "Request not found")

    # canViewRequest spans every global-view role plus every peer in the same
    # institution; appending an attachment is a write, so it needs write
    # authority (the owning requester, or the role currently holding the
    # stage) — deliberately not the broader read predicate.
    if not can_view_request(current_user, request):
        raise FilesServiceError(404, "Request not found")
    if not can_attach_to_request(current_user, request):
        raise FilesServiceError(403, "You are not permitted to attach files to this request.")

    if not attachments:
        raise FilesServiceError(400, "At least one attachment is required")

    try:
        stored_files = await store_uploaded_files(db, attachments, uploaded_by_id=current_user.id)
    except InvalidUploadError as exc:
        raise FilesServiceError(400, str(exc)) from exc

    for f in stored_files:
        repo.add_request_attachment(db, request_id=request.id, file_id=f.id)
    await repo.commit(db)

    return {
        "message": "Files uploaded successfully",
        "requestId": request.id,
        "attachments": [{"fileId": f.id, "filename": f.original_filename, "mimetype": f.mimetype} for f in stored_files],
    }


async def get_downloadable_file(db: AsyncSession, current_user: CurrentUser, file_id: int) -> StoredFile:
    if not await can_access_file(db, current_user, file_id):
        # 404, not 403 — cannot be used to probe which ids exist.
        raise FilesServiceError(404, "File not found")

    stored_file = await repo.get_stored_file_by_id(db, file_id)
    if stored_file is None:
        raise FilesServiceError(404, "File not found")
    return stored_file
