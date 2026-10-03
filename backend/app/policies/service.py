"""Business logic for Policies. Reference: src/controllers/policyController.js."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.files.validation import InvalidUploadError
from app.policies.models import Policy
from app.policies import repository as repo
from app.requests.access import POLICY_PUBLIC_FIELDS, can_view_full_policy
from app.files.service import store_uploaded_files


class PolicyServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def _serialize_full(db: AsyncSession, policy: Policy) -> dict:
    policy_queries = await repo.list_queries_for_policy(db, policy.id)
    attachments_by_query = {q.id: await repo.list_query_attachments(db, q.id) for q in policy_queries}

    def _user_summary(user):
        return {"id": user.id, "name": user.name, "role": user.role} if user else None

    return {
        "id": policy.id,
        "title": policy.title,
        "description": policy.description,
        "cost": float(policy.cost) if policy.cost is not None else None,
        "requester": (
            {"id": policy.requester.id, "name": policy.requester.name, "email": policy.requester.email, "role": policy.requester.role}
            if policy.requester
            else None
        ),
        "policy_approval_status": policy.policy_approval_status,
        "rejected_reason": policy.rejected_reason,
        "attachments": await repo.list_attachments(db, policy.id),
        "queries": [
            {
                "id": q.id,
                "query": q.query,
                "query_reply": q.query_reply,
                "query_resolved": q.query_resolved,
                "raised_by": _user_summary(q.raised_by),
                "query_reply_by": _user_summary(q.query_reply_by),
                "attachments_count": len(attachments_by_query[q.id]),
                "created_at": q.created_at,
                "updated_at": q.updated_at,
            }
            for q in policy_queries
        ],
        "created_at": policy.created_at,
        "updated_at": policy.updated_at,
    }


async def _serialize_public(db: AsyncSession, policy: Policy) -> dict:
    full = await _serialize_full(db, policy)
    return {key: full[key] for key in ("id", *POLICY_PUBLIC_FIELDS) if key in full}


async def list_policies(db: AsyncSession, current_user: CurrentUser) -> dict:
    if current_user.role == "HEAD_OF_INSTITUTION":
        policies = await repo.list_policies(db, requester_id=current_user.id)
        access_level = "full"
    elif current_user.role in ("DIRECTOR_ADMIN", "CHAIRMAN"):
        policies = await repo.list_policies(db)
        access_level = "full"
    else:
        policies = await repo.list_policies(db)
        access_level = "readonly"

    serialize = _serialize_full if access_level == "full" else _serialize_public

    return {
        "success": True,
        "count": len(policies),
        "data": [await serialize(db, p) for p in policies],
        "user_role": current_user.role,
        "access_level": access_level,
    }


async def get_policy(db: AsyncSession, current_user: CurrentUser, policy_id: int) -> dict:
    policy = await repo.get_policy_by_id(db, policy_id)
    if policy is None:
        raise PolicyServiceError(404, "Policy not found")

    # GET /policies deliberately reduces the projection for roles outside
    # HEAD_OF_INSTITUTION (own policies only), DIRECTOR_ADMIN and CHAIRMAN — this
    # endpoint must not be a way around that projection, so the same rule
    # applies here. Policies stay readable by all staff by design (reference
    # material); only the privileged fields are gated.
    if not can_view_full_policy(current_user, policy):
        return {"success": True, "data": await _serialize_public(db, policy), "access_level": "readonly"}

    return {"success": True, "data": await _serialize_full(db, policy), "access_level": "full"}


async def create_policy(
    db: AsyncSession, current_user: CurrentUser, *, title: str, description: str, cost: float | None, files: list
) -> dict:
    if current_user.role != "HEAD_OF_INSTITUTION":
        raise PolicyServiceError(403, "Only HEAD_OF_INSTITUTION can create policies")
    if not title:
        raise PolicyServiceError(400, "Policy title is required")
    if not description:
        raise PolicyServiceError(400, "Policy description is required")

    policy = Policy(requester_id=current_user.id, title=title, description=description, cost=cost, policy_approval_status="PENDING")
    repo.add_policy(db, policy)
    await repo.flush(db)

    if files:
        try:
            stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
        except InvalidUploadError as exc:
            raise PolicyServiceError(400, f"Failed to upload attachments: {exc}") from exc
        for f in stored_files:
            repo.add_policy_attachment(db, policy_id=policy.id, file_id=f.id)

    await repo.commit(db)
    policy = await repo.get_policy_by_id(db, policy.id)

    return {"success": True, "message": "Policy created successfully", "data": await _serialize_full(db, policy)}


async def update_policy(
    db: AsyncSession, current_user: CurrentUser, policy_id: int, *, policy_approval_status: str | None, rejected_reason: str | None
) -> dict:
    if current_user.role != "CHAIRMAN":
        raise PolicyServiceError(403, "Only CHAIRMAN can update policies")

    policy = await repo.get_policy_by_id(db, policy_id)
    if policy is None:
        raise PolicyServiceError(404, "Policy not found")

    if policy.policy_approval_status != "PENDING":
        raise PolicyServiceError(400, f"This policy has already been {policy.policy_approval_status.lower()}")

    if policy_approval_status == "REJECTED":
        if not (rejected_reason or "").strip():
            raise PolicyServiceError(400, "A reason must be provided when rejecting a policy")
        policy.policy_approval_status = "REJECTED"
        policy.rejected_reason = rejected_reason
    elif policy_approval_status == "APPROVED":
        policy.policy_approval_status = "APPROVED"
    else:
        raise PolicyServiceError(400, "Chairman must specify approval status as APPROVED or REJECTED")

    await repo.commit(db)
    policy = await repo.get_policy_by_id(db, policy_id)

    return {"success": True, "message": "Policy updated successfully", "data": await _serialize_full(db, policy)}
