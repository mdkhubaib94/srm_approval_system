"""Business logic for Flagged (SLA-breach) records. Reference:
src/controllers/flagController.js."""

from app.users.constants import institutions_for, same_institution
from datetime import datetime, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.flagged.models import Flagged
from app.flagged import repository as repo
from app.requests.access import action_comment_visibility
from app.requests.models import Request, RequestActionHistory
from app.requests.service import serialize_action_history
from app.requests.workflow import ALL_STAGES, get_next_stage, skip_hoi_stage

# Flat ordering of all stages, low-to-high seniority. Branches (HR_HEAD, MMA,
# MANAGER_DATA_MANAGEMENT, etc.) are ordered between CHAIRMAN_OFFICE and
# AUDIT — their exact position relative to each other doesn't matter for
# visibility since each role only acts at its own stage.
STAGES_ORDER = list(ALL_STAGES)

# Stages DIRECTOR_ADMIN can see/act on: everything except CHAIRMAN_OFFICE, CHIEF_DIRECTOR, CHAIRMAN
DIRECTOR_ADMIN_STAGES = [s for s in STAGES_ORDER if s not in ("CHAIRMAN_OFFICE", "CHIEF_DIRECTOR", "CHAIRMAN")]
# Stages CHIEF_DIRECTOR can see/act on: everything except CHAIRMAN_OFFICE, CHAIRMAN
CHIEF_DIRECTOR_STAGES = [s for s in STAGES_ORDER if s not in ("CHAIRMAN_OFFICE", "CHAIRMAN")]


class FlaggedServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _has_access(current_user: CurrentUser, request: Request) -> bool:
    role = current_user.role
    if role in ("INSTITUTION_MANAGER", "ACCOUNTANT"):
        return request.stage == role and same_institution(request.institution, current_user.institution, role)
    if role == "HEAD_OF_INSTITUTION":
        return request.stage in ("INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION") and request.institution == current_user.institution
    if role == "CHAIRMAN_OFFICE":
        return True
    if role in ("HR_HEAD", "MMA", "MANAGER_DATA_MANAGEMENT", "AUDIT", "GM_FINANCE", "DIRECTOR_ADMISSIONS", "DIRECTOR_RESEARCH"):
        return request.stage == role
    if role == "DIRECTOR_ADMIN":
        return request.stage in DIRECTOR_ADMIN_STAGES
    if role == "CHIEF_DIRECTOR":
        return request.stage in CHIEF_DIRECTOR_STAGES
    if role == "CHAIRMAN":
        return True
    return False


def _serialize_flagged(f: Flagged, *, include_full_request: bool = False, current_user: CurrentUser | None = None) -> dict:
    request = f.request
    request_data = None
    if request is not None:
        if include_full_request:
            full_history = list(request.action_history)
            request_data = {
                "id": request.id,
                "request_id": request.request_id,
                "title": request.title,
                "stage": request.stage,
                "status": request.status,
                "institution": request.institution,
                "department": request.department,
                "cost": float(request.cost) if request.cost is not None else None,
                "working_hrs_taken": float(request.working_hrs_taken) if request.working_hrs_taken is not None else None,
                "stage_arrived_at": request.stage_arrived_at,
                "request_category": request.request_category,
                "requester": (
                    {"id": request.requester.id, "name": request.requester.name, "email": request.requester.email}
                    if request.requester
                    else None
                ),
                "action_history": serialize_action_history(full_history, action_comment_visibility(request, current_user)),
            }
        else:
            request_data = {
                "id": request.id,
                "request_id": request.request_id,
                "title": request.title,
                "stage": request.stage,
                "status": request.status,
                "institution": request.institution,
                "department": request.department,
                "cost": float(request.cost) if request.cost is not None else None,
                "working_hrs_taken": float(request.working_hrs_taken) if request.working_hrs_taken is not None else None,
                "stage_arrived_at": request.stage_arrived_at,
                "request_category": request.request_category,
                "requester": (
                    {"id": request.requester.id, "name": request.requester.name, "email": request.requester.email}
                    if request.requester
                    else None
                ),
            }

    return {
        "id": f.id,
        "request": request_data,
        "flagged_at": [{"id": fu.user.id, "name": fu.user.name, "role": fu.user.role} for fu in f.flagged_users],
        "flagged_stage": f.flagged_stage,
        "flag_resolved": f.flag_resolved,
        "created_at": f.created_at,
    }


async def list_flagged(db: AsyncSession, current_user: CurrentUser, *, show_resolved: bool) -> dict:
    role = current_user.role
    stmt = repo.base_flagged_statement()

    if not show_resolved:
        stmt = stmt.where(Flagged.flag_resolved.is_(False))

    if role in ("INSTITUTION_MANAGER", "ACCOUNTANT"):
        stmt = stmt.where(Request.stage == role, Request.institution.in_(institutions_for(current_user.institution, role)))
    elif role == "HEAD_OF_INSTITUTION":
        stmt = stmt.where(
            Request.stage.in_(["INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION"]),
            Request.institution == current_user.institution,
        )
    elif role == "CHAIRMAN_OFFICE":
        pass
    elif role in ("HR_HEAD", "MMA", "MANAGER_DATA_MANAGEMENT", "AUDIT", "GM_FINANCE", "DIRECTOR_ADMISSIONS", "DIRECTOR_RESEARCH"):
        stmt = stmt.where(Request.stage == role)
    elif role == "DIRECTOR_ADMIN":
        stmt = stmt.where(Request.stage.in_(DIRECTOR_ADMIN_STAGES))
    elif role == "CHIEF_DIRECTOR":
        stmt = stmt.where(Request.stage.in_(CHIEF_DIRECTOR_STAGES))
    elif role == "CHAIRMAN":
        pass
    else:
        raise FlaggedServiceError(403, "Unauthorized or unknown role for viewing system flags.")

    stmt = stmt.order_by(Flagged.created_at.desc())
    records = await repo.list_flagged(db, stmt)

    return {"success": True, "count": len(records), "data": [_serialize_flagged(f) for f in records]}


async def get_flagged(db: AsyncSession, current_user: CurrentUser, flagged_id: int) -> dict:
    flagged = await repo.get_flagged_by_id(db, flagged_id)
    if flagged is None:
        raise FlaggedServiceError(404, "Flagged record not found")
    if flagged.request is None:
        raise FlaggedServiceError(404, "Associated request not found")

    if not _has_access(current_user, flagged.request):
        raise FlaggedServiceError(403, "You do not have permission to view this flagged record")

    return {"success": True, "data": _serialize_flagged(flagged, include_full_request=True, current_user=current_user)}


async def resolve_flag_and_forward(db: AsyncSession, current_user: CurrentUser, flagged_id: int) -> dict:
    flagged = await repo.get_flagged_with_requester(db, flagged_id)
    if flagged is None:
        raise FlaggedServiceError(404, "Flagged record not found")
    if flagged.request is None:
        raise FlaggedServiceError(404, "Associated request not found")
    if flagged.flag_resolved:
        raise FlaggedServiceError(400, "This flag has already been resolved")

    request = flagged.request
    if not _has_access(current_user, request):
        raise FlaggedServiceError(403, "You do not have permission to resolve this flagged record")

    next_stage = get_next_stage(request.request_category, request.stage)
    next_stage = skip_hoi_stage(request.request_category, next_stage, request.is_hoi_created)
    if not next_stage:
        raise FlaggedServiceError(400, "Request is already at the final stage and cannot be forwarded")

    previous_stage = request.stage
    request.stage = next_stage
    request.working_hrs_taken = 0
    request.stage_arrived_at = datetime.now(timezone.utc)
    repo.add_action_history(
        db,
        RequestActionHistory(
            request_id=request.id,
            action_by_id=current_user.id,
            action="forwarded",
            comments=f"Resolved SLA breach and forwarded from {previous_stage} to {next_stage}",
        ),
    )
    flagged.flag_resolved = True

    await repo.commit(db)

    request = await repo.get_request_full(db, request.id)
    flagged = await repo.get_flagged_basic(db, flagged_id)

    full_history = list(request.action_history)

    return {
        "success": True,
        "message": f"Flag resolved and request forwarded to {next_stage}",
        "data": {
            "flagged": _serialize_flagged(flagged),
            "request": {
                "id": request.id,
                "request_id": request.request_id,
                "title": request.title,
                "stage": request.stage,
                "status": request.status,
                "action_history": serialize_action_history(full_history, action_comment_visibility(request, current_user)),
            },
        },
    }
