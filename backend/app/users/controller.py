from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user, require_roles
from app.core.rbac import USER_MANAGER_ROLES
from app.db.session import get_db
from app.users import service
from app.users.schemas import (
    BulkCreateUsersIn,
    ChangeMyPasswordIn,
    CreateUserIn,
    SetUserPasswordIn,
    UpdateMeIn,
    UpdateUserIn,
    UserOut,
    VerifyMyPasswordIn,
)

router = APIRouter(prefix="/users", tags=["users"])


def _raise(exc: service.UsersServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


# ─── Read ─────────────────────────────────────────────────────────────────────


@router.get("/me", response_model=UserOut)
async def get_me(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_me(db, current_user)
    except service.UsersServiceError as exc:
        _raise(exc)


@router.get("", response_model=list[UserOut])
async def get_all_users(
    role: str | None = None,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    return await service.list_users(db, current_user, role)


@router.get("/{email}", response_model=UserOut)
async def get_user_by_email(
    email: str,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.get_user_by_email(db, current_user, email)
    except service.UsersServiceError as exc:
        _raise(exc)


# ─── Create ───────────────────────────────────────────────────────────────────


@router.post("", status_code=status.HTTP_201_CREATED, response_model=UserOut)
async def create_user(
    body: CreateUserIn,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.create_user(
            db,
            current_user,
            role=body.role,
            name=body.name,
            employee_id=body.employee_id,
            email=body.email,
            phone=body.phone,
            department=body.department,
            institution=body.institution,
        )
    except service.UsersServiceError as exc:
        _raise(exc)


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_users(
    body: BulkCreateUsersIn,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.bulk_create_users(db, current_user, role=body.role, institution=body.institution, rows=body.rows)
    except service.UsersServiceError as exc:
        _raise(exc)


# ─── Update / Delete (by admin) ────────────────────────────────────────────────


@router.patch("/{user_id:int}", response_model=UserOut)
async def update_user(
    user_id: int,
    body: UpdateUserIn,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_user(
            db,
            current_user,
            user_id,
            name=body.name,
            phone=body.phone,
            email=body.email,
            institution=body.institution,
            department=body.department,
        )
    except service.UsersServiceError as exc:
        _raise(exc)


@router.post("/{user_id:int}/password")
async def set_user_password(
    user_id: int,
    body: SetUserPasswordIn,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        await service.set_user_password(db, current_user, user_id, new_password=body.new_password)
    except service.UsersServiceError as exc:
        _raise(exc)
    return {"message": "Password changed", "id": user_id}


@router.delete("/{user_id:int}")
async def delete_user(
    user_id: int,
    current_user: CurrentUser = Depends(require_roles(*USER_MANAGER_ROLES)),
    db: AsyncSession = Depends(get_db),
):
    try:
        await service.delete_user(db, current_user, user_id)
    except service.UsersServiceError as exc:
        _raise(exc)
    return {"message": "User deleted", "id": user_id}


# ─── Self-service profile ──────────────────────────────────────────────────────


@router.patch("/me", response_model=UserOut)
async def update_me(
    body: UpdateMeIn,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_me(db, current_user, phone=body.phone, department=body.department)
    except service.UsersServiceError as exc:
        _raise(exc)


@router.post("/me/verify-password")
async def verify_my_password(
    body: VerifyMyPasswordIn,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await service.verify_my_password(db, current_user, current_password=body.current_password)
    except service.UsersServiceError as exc:
        _raise(exc)
    return {"message": "Password verified"}


@router.post("/me/change-password")
async def change_my_password(
    body: ChangeMyPasswordIn,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        await service.change_my_password(
            db, current_user, current_password=body.current_password, new_password=body.new_password
        )
    except service.UsersServiceError as exc:
        _raise(exc)
    return {"message": "Password changed"}
