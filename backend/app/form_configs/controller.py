from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.db.session import get_db
from app.form_configs.schemas import FormConfigIn, FormConfigUpdateIn
from app.form_configs import service

router = APIRouter(prefix="/form-configs", tags=["form-configs"])


def _raise(exc: service.FormConfigServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def get_form_configs(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_form_configs(db)


@router.get("/{request_type}")
async def get_form_config_by_type(
    request_type: str, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.get_form_config(db, request_type)
    except service.FormConfigServiceError as exc:
        _raise(exc)


@router.post("", status_code=201)
async def create_form_config(
    body: FormConfigIn, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.create_form_config(
            db, current_user, request_type=body.request_type, title=body.title, fields=body.fields
        )
    except service.FormConfigServiceError as exc:
        _raise(exc)


@router.patch("/{request_type}")
async def update_form_config(
    request_type: str,
    body: FormConfigUpdateIn,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_form_config(db, current_user, request_type, title=body.title, fields=body.fields)
    except service.FormConfigServiceError as exc:
        _raise(exc)


@router.delete("/{request_type}")
async def delete_form_config(
    request_type: str, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.delete_form_config(db, current_user, request_type)
    except service.FormConfigServiceError as exc:
        _raise(exc)
