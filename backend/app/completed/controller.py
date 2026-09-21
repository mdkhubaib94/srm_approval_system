from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.core.multipart import parse_form_or_json
from app.db.session import get_db
from app.completed import service

router = APIRouter(prefix="/completed", tags=["completed"])


def _raise(exc: service.CompletedServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def get_all_completed(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.list_completed(db, current_user)
    except service.CompletedServiceError as exc:
        _raise(exc)


@router.get("/{completed_id}")
async def get_completed_by_id(completed_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_completed(db, current_user, completed_id)
    except service.CompletedServiceError as exc:
        _raise(exc)


@router.patch("/{completed_id}/expected")
async def update_expected(
    completed_id: int,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_expected_completion(
            db, current_user, completed_id, body.get("expectedCompletion") or body.get("expected_completion")
        )
    except service.CompletedServiceError as exc:
        _raise(exc)


@router.patch("/{completed_id}/actual")
async def update_actual(
    completed_id: int,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # FastAPI's Form(alias=...) only ever matches its own declared name for
    # multipart bodies (confirmed against a real request) — every dual-cased
    # field name is looked up by hand instead.
    fields, attachments = await parse_form_or_json(request)

    completion_date = fields.get("completion_date") or fields.get("completionDate")
    reason_for_pending = fields.get("reason_for_pending") or fields.get("reasonForPending")
    completed_status = fields.get("completed_status") or fields.get("completedStatus")

    try:
        return await service.update_actual_completion(
            db,
            current_user,
            completed_id,
            completion_date=completion_date,
            reason_for_pending=reason_for_pending,
            completed_status=completed_status,
            files=attachments,
        )
    except service.CompletedServiceError as exc:
        _raise(exc)
