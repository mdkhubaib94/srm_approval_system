from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_roles
from app.core.rbac import PERMISSION_MANAGER_ROLES
from app.db.session import get_db
from app.permissions import service
from app.permissions.schemas import PermissionOut, UpdatePermissionRolesIn

router = APIRouter(prefix="/permissions", tags=["permissions"])


def _raise(exc: service.PermissionsServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("/mine")
async def get_my_permissions(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.get_my_permissions(db, current_user)


@router.get("", response_model=list[PermissionOut])
async def list_permissions(
    current_user: CurrentUser = Depends(require_roles(*PERMISSION_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_permissions(db)


@router.put("/{permission_key}", response_model=PermissionOut)
async def update_permission(
    permission_key: str,
    body: UpdatePermissionRolesIn,
    current_user: CurrentUser = Depends(require_roles(*PERMISSION_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_permission_roles(db, permission_key, body.roles)
    except service.PermissionsServiceError as exc:
        _raise(exc)
