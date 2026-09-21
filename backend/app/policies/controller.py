from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.db.session import get_db
from app.policies import service

router = APIRouter(prefix="/policies", tags=["policies"])


def _raise(exc: service.PolicyServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def get_policies(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    return await service.list_policies(db, current_user)


@router.get("/{policy_id}")
async def get_policy_by_id(policy_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_policy(db, current_user, policy_id)
    except service.PolicyServiceError as exc:
        _raise(exc)


@router.post("", status_code=201)
async def create_policy(
    title: str = Form(...),
    description: str = Form(...),
    cost: float | None = Form(None),
    attachments: list[UploadFile] = File(default=[]),
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.create_policy(db, current_user, title=title, description=description, cost=cost, files=attachments)
    except service.PolicyServiceError as exc:
        _raise(exc)


@router.patch("/{policy_id}")
async def update_policy(
    policy_id: int,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.update_policy(
            db,
            current_user,
            policy_id,
            policy_approval_status=body.get("policyApprovalStatus") or body.get("policy_approval_status"),
            rejected_reason=body.get("rejectedReason") or body.get("rejected_reason"),
        )
    except service.PolicyServiceError as exc:
        _raise(exc)
