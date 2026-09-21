from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import AliasChoices
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.db.session import get_db
from app.flagged import service

router = APIRouter(prefix="/flagged", tags=["flagged"])


def _raise(exc: service.FlaggedServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def get_all_flagged(
    show_resolved: bool = Query(False, validation_alias=AliasChoices("show_resolved", "showResolved")),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.list_flagged(db, current_user, show_resolved=show_resolved)
    except service.FlaggedServiceError as exc:
        _raise(exc)


@router.get("/{flagged_id}")
async def get_flagged_by_id(flagged_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_flagged(db, current_user, flagged_id)
    except service.FlaggedServiceError as exc:
        _raise(exc)


@router.patch("/{flagged_id}")
async def resolve_flagged(flagged_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.resolve_flag_and_forward(db, current_user, flagged_id)
    except service.FlaggedServiceError as exc:
        _raise(exc)
