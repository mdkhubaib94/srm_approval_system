"""Business logic for Queries. Reference: src/controllers/queryController.js."""

from datetime import datetime, timezone

from fastapi import BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.files.validation import InvalidUploadError
from app.queries.models import Query
from app.queries import repository as repo
from app.requests.access import (
    can_raise_policy_query,
    can_raise_query,
    can_reply_to_policy_query,
    can_reply_to_query,
    can_view_policy_query,
    can_view_query,
)
from app.files.service import store_uploaded_files
from app.requests.service import RequestServiceError, notify_relevant_users, visible_requests_clause


class QueryServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def _serialize(db: AsyncSession, q: Query) -> dict:
    return {
        "id": q.id,
        "request": (
            {"id": q.request.id, "request_id": q.request.request_id, "title": q.request.title} if q.request else None
        ),
        "policy": ({"id": q.policy.id, "title": q.policy.title} if q.policy else None),
        "raised_by": (
            {"id": q.raised_by.id, "name": q.raised_by.name, "email": q.raised_by.email, "role": q.raised_by.role}
            if q.raised_by
            else None
        ),
        "query": q.query,
        "query_reply": q.query_reply,
        "query_reply_by": (
            {
                "id": q.query_reply_by.id,
                "name": q.query_reply_by.name,
                "email": q.query_reply_by.email,
                "role": q.query_reply_by.role,
            }
            if q.query_reply_by
            else None
        ),
        "query_resolved": q.query_resolved,
        "attachments": await repo.list_attachments(db, q.id),
        "created_at": q.created_at,
        "updated_at": q.updated_at,
    }


async def list_all_queries(db: AsyncSession, current_user: CurrentUser) -> dict:
    try:
        clause = visible_requests_clause(current_user)
    except RequestServiceError as exc:
        raise QueryServiceError(exc.status_code, exc.message) from exc
    visible_request_ids = await repo.list_visible_request_ids(db, clause)

    request_queries = await repo.list_queries_for_requests(db, visible_request_ids)
    # Every authenticated user can already view every policy (see
    # can_view_policy_query), so policy-linked queries need no id filter.
    policy_queries = await repo.list_queries_for_policies(db)

    queries = sorted(request_queries + policy_queries, key=lambda q: q.created_at, reverse=True)
    return {"success": True, "count": len(queries), "data": [await _serialize(db, q) for q in queries]}


async def get_query(db: AsyncSession, current_user: CurrentUser, query_id: int) -> dict:
    query = await repo.get_query_by_id(db, query_id)
    if query is None:
        raise QueryServiceError(404, "Query not found")

    if query.request_id is not None:
        allowed = can_view_query(current_user, query.request)
    else:
        allowed = can_view_policy_query(current_user, query.policy)

    if not allowed:
        # 404, not 403 — confirming the query exists is itself a leak.
        raise QueryServiceError(404, "Query not found")

    return {"success": True, "data": await _serialize(db, query)}


async def create_query(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    request_ref: str | None,
    policy_ref: str | None,
    query_text: str,
    query_reply_by: int | None,
) -> dict:
    if not query_text:
        raise QueryServiceError(400, "Query text is required")
    if bool(request_ref) == bool(policy_ref):
        raise QueryServiceError(400, "Exactly one of a request or a policy must be given")

    if request_ref:
        request_id = int(request_ref) if str(request_ref).isdigit() else None
        parent = await repo.get_request_with_action_history(db, request_id) if request_id else None
        if parent is None:
            raise QueryServiceError(404, "Request not found")

        # Existence was checked but authority never was: raising a query
        # flips the request to QUERY status, halting its approval clock.
        if not can_view_query(current_user, parent):
            raise QueryServiceError(404, "Request not found")
        if not can_raise_query(current_user, parent):
            raise QueryServiceError(403, "You are not permitted to raise a query on this request.")

        new_query = Query(
            request_id=parent.id, raised_by_id=current_user.id, query=query_text, query_reply_by_id=query_reply_by
        )
        repo.add_query(db, new_query)
        parent.status = "QUERY"
    else:
        policy_id = int(policy_ref) if str(policy_ref).isdigit() else None
        parent = await repo.get_policy_with_requester(db, policy_id) if policy_id else None
        if parent is None:
            raise QueryServiceError(404, "Policy not found")

        if not can_view_policy_query(current_user, parent):
            raise QueryServiceError(404, "Policy not found")
        if not can_raise_policy_query(current_user, parent):
            raise QueryServiceError(403, "You are not permitted to raise a query on this policy.")

        new_query = Query(
            policy_id=parent.id, raised_by_id=current_user.id, query=query_text, query_reply_by_id=query_reply_by
        )
        repo.add_query(db, new_query)

    await repo.commit(db)
    new_query = await repo.get_query_by_id(db, new_query.id)

    return {"success": True, "message": "Query created successfully", "data": await _serialize(db, new_query)}


async def update_query(
    db: AsyncSession,
    current_user: CurrentUser,
    query_id: int,
    *,
    query_reply: str | None,
    query_resolved: bool | None,
    files: list,
    background_tasks: BackgroundTasks | None = None,
) -> dict:
    query = await repo.get_query_by_id(db, query_id)
    if query is None:
        raise QueryServiceError(404, "Query not found")

    is_request_query = query.request_id is not None
    parent = query.request if is_request_query else query.policy

    if is_request_query:
        if parent is None or not can_view_query(current_user, parent):
            raise QueryServiceError(404, "Query not found")
        if not can_reply_to_query(current_user, query, parent):
            raise QueryServiceError(403, "You are not permitted to respond to this query.")
    else:
        if parent is None or not can_view_policy_query(current_user, parent):
            raise QueryServiceError(404, "Query not found")
        if not can_reply_to_policy_query(current_user, query, parent):
            raise QueryServiceError(403, "You are not permitted to respond to this query.")

    if query_reply is not None:
        query.query_reply = query_reply
    if query_resolved is not None:
        query.query_resolved = query_resolved

    if files:
        try:
            stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
        except InvalidUploadError as exc:
            raise QueryServiceError(400, f"Failed to upload attachments: {exc}") from exc
        for f in stored_files:
            repo.add_query_attachment(db, query_id=query.id, file_id=f.id)

    # If resolved, return the parent request to PENDING — but only when no
    # other query on the same request is still unresolved. Policies have no
    # analogous status flip: raising a policy query never halted its
    # approval clock in the first place (see create_query), so there is
    # nothing to restore here.
    all_resolved = False
    if query_resolved is True and is_request_query:
        other_open = await repo.count_other_open_queries(db, request_id=parent.id, exclude_query_id=query.id)
        if other_open == 0:
            parent.status = "PENDING"
            parent.working_hrs_taken = 0
            parent.stage_arrived_at = datetime.now(timezone.utc)
            all_resolved = True

    await repo.commit(db)

    if all_resolved and background_tasks is not None and parent.stage:
        background_tasks.add_task(notify_relevant_users, db, parent.stage, parent, "queries_replied")

    query = await repo.get_query_by_id(db, query_id)

    return {"success": True, "message": "Query updated successfully", "data": await _serialize(db, query)}
