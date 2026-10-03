"""Business logic for Completed records. Reference:
src/controllers/completeController.js."""

from datetime import datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.completed.models import Completed
from app.files.validation import InvalidUploadError
from app.completed import repository as repo
from app.requests.access import can_update_completed, can_view_completed
from app.files.service import store_uploaded_files


class CompletedServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def _serialize(db: AsyncSession, c: Completed) -> dict:
    return {
        "id": c.id,
        "request": (
            {
                "id": c.request.id,
                "request_id": c.request.request_id,
                "title": c.request.title,
                "is_hoi_created": c.request.is_hoi_created,
                "requester": (
                    {"id": c.request.requester.id, "name": c.request.requester.name, "email": c.request.requester.email}
                    if c.request.requester
                    else None
                ),
            }
            if c.request
            else None
        ),
        "expected_completion": c.expected_completion,
        "completion_date": c.completion_date,
        "reason_for_pending": c.reason_for_pending,
        "completed_status": c.completed_status,
        "overdue_email_sent": c.overdue_email_sent,
        "attachments": await repo.list_attachments(db, c.id),
        "created_at": c.created_at,
        "updated_at": c.updated_at,
    }


async def list_completed(db: AsyncSession, current_user: CurrentUser) -> dict:
    role = current_user.role
    if role == "REQUESTER":
        owned_ids = await repo.list_request_ids_for_requester(db, current_user.id)
        completed = await repo.list_completed(db, request_ids=owned_ids)
    elif role == "HEAD_OF_INSTITUTION":
        inst_ids = await repo.list_request_ids_for_institution(db, current_user.institution)
        completed = await repo.list_completed(db, request_ids=inst_ids)
    elif role in ("DIRECTOR_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN", "CHAIRMAN_OFFICE"):
        completed = await repo.list_completed(db)
    else:
        raise CompletedServiceError(403, "Unauthorized or unknown role.")

    return {"success": True, "count": len(completed), "data": [await _serialize(db, c) for c in completed]}


async def get_completed(db: AsyncSession, current_user: CurrentUser, completed_id: int) -> dict:
    completed = await repo.get_completed_by_id(db, completed_id)
    if completed is None or completed.request is None:
        raise CompletedServiceError(404, "Completed request not found")

    if not can_view_completed(current_user, completed.request):
        # 404, not 403 — a 403 here would confirm the record exists.
        raise CompletedServiceError(404, "Completed request not found")

    return {"success": True, "data": await _serialize(db, completed)}


async def _load_authorized(db: AsyncSession, current_user: CurrentUser, completed_id: int) -> Completed:
    completed = await repo.get_completed_by_id(db, completed_id)
    if completed is None or completed.request is None:
        raise CompletedServiceError(404, "Completed request not found")
    if not can_view_completed(current_user, completed.request):
        raise CompletedServiceError(404, "Completed request not found")
    if not can_update_completed(current_user, completed.request):
        raise CompletedServiceError(403, "You are not permitted to update this completion record.")
    return completed


async def update_expected_completion(db: AsyncSession, current_user: CurrentUser, completed_id: int, expected_completion: str | None) -> dict:
    if not expected_completion:
        raise CompletedServiceError(400, "expectedCompletion date is required")

    completed = await _load_authorized(db, current_user, completed_id)

    try:
        parsed = datetime.fromisoformat(expected_completion).date()
    except ValueError:
        raise CompletedServiceError(400, "expectedCompletion must be a valid date")

    completed.expected_completion = parsed
    # A new deadline can go overdue again in its own right, so let the
    # reminder fire again for it instead of staying silenced by the old one.
    completed.overdue_email_sent = False

    await repo.commit(db)
    completed = await repo.get_completed_by_id(db, completed_id)

    return {"success": True, "message": "Expected completion date updated successfully", "data": await _serialize(db, completed)}


async def update_actual_completion(
    db: AsyncSession,
    current_user: CurrentUser,
    completed_id: int,
    *,
    completion_date: str | None,
    reason_for_pending: str | None,
    completed_status: str | bool | None,
    files: list,
) -> dict:
    completed = await _load_authorized(db, current_user, completed_id)

    # Once marked completed the record is final — hold that line at the API
    # too, not just in the frontend's read-only rendering.
    if completed.completed_status:
        raise CompletedServiceError(400, "This request is already marked completed and can no longer be updated.")

    if completion_date:
        try:
            completed.completion_date = datetime.fromisoformat(completion_date).date()
        except ValueError:
            raise CompletedServiceError(400, "completionDate must be a valid date")

    if reason_for_pending is not None:
        completed.reason_for_pending = reason_for_pending

    if completed_status is not None:
        # Arrives as a multipart string ("true"/"false"); only the literal
        # "true" (or a real boolean True) counts — Python's bool("false") is
        # truthy, which would mark every "Not Completed" submission complete.
        completed.completed_status = completed_status is True or completed_status == "true"

    if files:
        try:
            stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
        except InvalidUploadError as exc:
            raise CompletedServiceError(400, f"Failed to upload attachments: {exc}") from exc
        for f in stored_files:
            repo.add_completed_attachment(db, completed_id=completed.id, file_id=f.id)

    await repo.commit(db)
    completed = await repo.get_completed_by_id(db, completed_id)

    return {"success": True, "message": "Actual completion details updated successfully", "data": await _serialize(db, completed)}
