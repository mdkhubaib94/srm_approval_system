"""Business logic for the Request workflow. Reference for this file:
src/controllers/requestController.js.
"""

from app.users.constants import institutions_for, same_institution
from datetime import datetime, timezone

from fastapi import BackgroundTasks
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.email.service import send_request_approval_email, send_request_notification
from app.files.validation import InvalidUploadError
from app.requests import repository as repo
from app.requests.access import (
    GLOBAL_VIEW_ROLES,
    INSTITUTION_VIEW_ROLES,
    can_act_on_request,
    can_view_all_requests,
    can_view_request,
    filter_action_history_for_viewer,
)
from app.requests.details.fields import model_to_dict, pick_model_fields
from app.requests.details.nesting import flatten_detail_payload, nest_detail_dict
from app.requests.details.registry import DETAIL_MODEL_TABLE_NAMES, get_detail_model
from app.requests.id_generator import generate_indent_number, generate_request_id
from app.requests.models import Request, RequestActionHistory
from app.requests.workflow import (
    ALL_STAGES,
    REQUEST_CATEGORIES,
    derive_request_category,
    get_next_stage,
    skip_hoi_stage,
    is_institution_scoped,
)
from app.files.service import store_uploaded_files
from app.users.models import User


class RequestServiceError(Exception):
    """Raised for a caller-facing failure; `status_code` maps directly onto
    the HTTP response the router should return."""

    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


async def get_request_by_lookup(db: AsyncSession, value: str | None) -> Request | None:
    return await repo.get_request_by_lookup(db, value)


async def notify_relevant_users(
    db: AsyncSession,
    stage: str | None,
    request: Request,
    action_type: str = "forwarded",
    forwarded_by_user: User | None = None,
    comments: str = "",
) -> None:
    """Best-effort notification to every user responsible for `stage`.
    Institution-scoped stages are filtered by the request's institution; all
    other stages are global. Never raises — a notification failure must not
    fail the request that triggered it."""
    try:
        if stage not in ALL_STAGES:
            return

        institution = None
        if is_institution_scoped(stage):
            if not request.institution:
                return
            institution = request.institution

        users = await repo.list_stage_users(db, stage, institution=institution)
        if not users:
            return

        request_data = {
            "request_id": request.request_id,
            "title": request.title,
            "institution": request.institution,
            "department": request.department,
            "cost": float(request.cost) if request.cost is not None else None,
            "stage": stage,
            "forwarded_by": forwarded_by_user.name if forwarded_by_user else None,
            "requester_name": request.requester.name if request.requester else None,
            "comments": comments,
        }

        for user in users:
            try:
                await send_request_notification(user.email, user.name, request_data, action_type)
            except Exception:  # pragma: no cover - best-effort, never fatal
                pass
    except Exception:  # pragma: no cover - best-effort, never fatal
        pass


async def create_request(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    title: str,
    description: str | None,
    department: str,
    comments: str | None,
    details_model: str,
    details_payload: dict,
    sop_text: str | None,
    sop_id: int | None,
    cost_estimate: float | None,
    files: list,
    background_tasks: BackgroundTasks,
) -> Request:
    if not files:
        raise RequestServiceError(400, "At least one attachment is required")

    institution = current_user.institution
    if not institution:
        raise RequestServiceError(400, "User institution is required")

    if not title or not department or not details_model or details_payload is None:
        raise RequestServiceError(400, "Missing required fields")

    final_cost_estimate = cost_estimate if cost_estimate and cost_estimate > 0 else 0

    general_category = details_payload.get("generalCategory") or details_payload.get("general_category")
    request_category = derive_request_category(details_model, general_category)
    if not request_category or request_category not in REQUEST_CATEGORIES:
        message = (
            "A valid generalCategory is required to determine the approval flow for General requests"
            if details_model == "GeneralDetail"
            else f"Unable to determine approval category for request type: {details_model}"
        )
        raise RequestServiceError(400, message)

    DetailModel = get_detail_model(details_model)
    if DetailModel is None:
        raise RequestServiceError(400, "Invalid or unsupported detail model type.")

    request_id = await generate_request_id(db, institution, department)

    try:
        stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
    except InvalidUploadError as exc:
        raise RequestServiceError(400, f"Failed to upload attachments: {exc}") from exc

    indent_rows = details_payload.pop("indent_details", None) or details_payload.pop("indentDetails", None)

    detail_fields = pick_model_fields(DetailModel, details_payload) or {}
    detail_doc = DetailModel(**detail_fields)
    repo.add_detail_row(db, detail_doc)
    await repo.flush(db)

    if indent_rows:
        from app.requests.details.models import IndentLineItem

        owner_table = DETAIL_MODEL_TABLE_NAMES[details_model]
        detail_doc.indent_number = generate_indent_number(institution, department)
        for i, row in enumerate(indent_rows):
            repo.add_indent_line_item(
                db,
                IndentLineItem(
                    owner_table=owner_table,
                    owner_id=detail_doc.id,
                    serial_number=i + 1,
                    product_id=row.get("product_id") or row.get("productId"),
                    product_name=row.get("product_name") or row.get("productName"),
                    product_description=row.get("product_description") or row.get("productDescription"),
                    quantity=row.get("quantity") or 1,
                ),
            )
        await repo.flush(db)

    request = Request(
        requester_id=current_user.id,
        request_id=request_id,
        title=title,
        description=description,
        institution=institution,
        department=department,
        request_category=request_category,
        details_model=details_model,
        details_table_id=detail_doc.id,
        cost=final_cost_estimate,
        sop_text=sop_text,
        sop_id=sop_id,
        sop_available=True if sop_id else None,
        stage="INSTITUTION_MANAGER",
        status="PENDING",
        is_hoi_created=current_user.role == "HEAD_OF_INSTITUTION",
    )
    repo.add_request(db, request)
    await repo.flush(db)

    for f in stored_files:
        repo.add_request_attachment(db, request_id=request.id, file_id=f.id)

    repo.add_action_history(
        db,
        RequestActionHistory(
            request_id=request.id,
            action_by_id=current_user.id,
            action="created",
            comments=comments or "Request submitted",
        ),
    )
    await repo.commit(db)

    await repo.refresh(db, request)
    request = await repo.get_request_by_lookup(db, str(request.id))

    # Fire-and-forget, same as the source's un-awaited
    # notifyRelevantUsers(...).catch(...): email delivery must not add
    # latency to request creation. FastAPI runs background tasks after the
    # response is sent but (on the FastAPI version pinned here, >=0.106)
    # before this request's `db` session (a yield-dependency) is closed, so
    # reusing it here is safe.
    background_tasks.add_task(notify_relevant_users, db, "INSTITUTION_MANAGER", request, "created")

    return request


# ─── Listing ──────────────────────────────────────────────────────────────────


async def list_all_requests(db: AsyncSession, current_user: CurrentUser) -> list[Request]:
    """GET /requests/all — unfiltered, cross-institution. Restricted to the
    senior roles that use the Workflow page."""
    if not can_view_all_requests(current_user):
        raise RequestServiceError(403, "Forbidden")
    return await repo.list_all_requests(db)


def visible_requests_clause(current_user: CurrentUser):
    """The role-scoped visibility clause shared by getUserRequests and
    getAllQueries in the source (both switch on role identically before
    getAllQueries adds its own further per-query authorization). Raises
    RequestServiceError(403) for a role with no defined stage mapping."""
    role = current_user.role

    if role == "REQUESTER":
        return Request.requester_id == current_user.id

    if role in INSTITUTION_VIEW_ROLES:
        base_clause = and_(Request.stage == role, Request.institution.in_(institutions_for(current_user.institution, role)))
    elif role in GLOBAL_VIEW_ROLES:
        base_clause = Request.stage == role
    else:
        raise RequestServiceError(403, "Unauthorized or unknown role.")

    # Non-requesters also see requests they previously acted on (audit trail).
    acted_subquery = select(RequestActionHistory.request_id).where(RequestActionHistory.action_by_id == current_user.id)
    return or_(base_clause, Request.id.in_(acted_subquery))


async def list_user_requests(db: AsyncSession, current_user: CurrentUser) -> list[Request]:
    """GET /requests — role-scoped list, mirrors requestController.js's
    getUserRequests switch."""
    clause = visible_requests_clause(current_user)
    return await repo.list_visible_requests(db, clause)


# ─── Detail / serialization ───────────────────────────────────────────────────


async def get_detail_document(db: AsyncSession, request: Request):
    DetailModel = get_detail_model(request.details_model)
    if DetailModel is None:
        return None
    return await repo.get_detail_row(db, DetailModel, request.details_table_id)


def serialize_action_history(entries: list[RequestActionHistory]) -> list[dict]:
    # Node's actionHistory sub-documents (Request.js) name this field
    # `timestamp`, not `createdAt` — the frontend's ActionHistory component
    # reads `action.timestamp` accordingly, so this can't go through the
    # normal created_at -> createdAt case conversion.
    return [
        {
            "id": e.id,
            "action_by": (
                {"id": e.action_by.id, "name": e.action_by.name, "role": e.action_by.role} if e.action_by else None
            ),
            "action": e.action,
            "comments": e.comments,
            "timestamp": e.created_at,
        }
        for e in entries
    ]


async def serialize_request(
    db: AsyncSession,
    request: Request,
    current_user: CurrentUser,
    *,
    include_detail: bool = True,
    include_queries: bool = False,
) -> dict:
    visible_history = filter_action_history_for_viewer(request, current_user, list(request.action_history))

    data = {
        "id": request.id,
        "request_id": request.request_id,
        "title": request.title,
        "description": request.description,
        "institution": request.institution,
        "department": request.department,
        "request_category": request.request_category,
        "details_model": request.details_model,
        "stage": request.stage,
        "status": request.status,
        "is_hoi_created": request.is_hoi_created,
        "cost": float(request.cost) if request.cost is not None else None,
        "rejected_reason": request.rejected_reason,
        "sop_available": request.sop_available,
        "sop_text": request.sop_text,
        "sop_id": await repo.get_sop_summary(db, request.sop_id) if request.sop_id else None,
        "budget_allocated": request.budget_allocated,
        "budget_spent": request.budget_spent,
        "budget_remaining": request.budget_remaining,
        "budget_available": request.budget_available,
        "working_hrs_taken": float(request.working_hrs_taken) if request.working_hrs_taken is not None else None,
        "stage_arrived_at": request.stage_arrived_at,
        "created_at": request.created_at,
        "updated_at": request.updated_at,
        "requester": (
            {"id": request.requester.id, "name": request.requester.name, "email": request.requester.email}
            if request.requester
            else None
        ),
        "action_history": serialize_action_history(visible_history),
        "attachments": await repo.list_attachments(db, request.id),
    }

    if include_detail:
        detail_doc = await get_detail_document(db, request)
        if detail_doc is not None:
            nested_details = nest_detail_dict(request.details_model, model_to_dict(detail_doc))
            nested_details["indentDetails"] = await _serialize_indent_line_items(db, request, detail_doc)

            from app.requests.details.registry import INDENT_CAPABLE_MODELS
            if request.details_model in INDENT_CAPABLE_MODELS:
                owner_table = DETAIL_MODEL_TABLE_NAMES.get(request.details_model)
                if owner_table:
                    change_log_rows = await repo.list_change_log(db, owner_table=owner_table, owner_id=detail_doc.id)
                    nested_details["changeLog"] = [
                        {
                            "action": c.action,
                            "rowLabel": c.row_label,
                            "serialNumber": c.serial_number,
                            "productId": c.product_id,
                            "field": c.field,
                            "oldValue": c.old_value,
                            "newValue": c.new_value,
                            "remark": c.remark,
                            "byName": c.by_name,
                            "role": c.role,
                            "at": c.created_at,
                        }
                        for c in change_log_rows
                    ]

            data["details"] = nested_details
        else:
            data["details"] = None

    if include_queries:
        request_queries = await repo.list_queries_for_request(db, request.id)
        attachments_by_query = {q.id: await repo.list_query_attachments(db, q.id) for q in request_queries}

        def _user_summary(user):
            return {"id": user.id, "name": user.name, "role": user.role} if user else None

        data["queries"] = [
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
            for q in request_queries
        ]

        data["query_attachments"] = [
            {**attachment, "query_id": q.id, "query_text": q.query, "replied_by": _user_summary(q.query_reply_by)}
            for q in request_queries
            for attachment in attachments_by_query[q.id]
        ]

    return data


async def _serialize_indent_line_items(db: AsyncSession, request: Request, detail_doc) -> list[dict] | None:
    from app.requests.details.registry import INDENT_CAPABLE_MODELS

    if request.details_model not in INDENT_CAPABLE_MODELS:
        return None

    owner_table = DETAIL_MODEL_TABLE_NAMES.get(request.details_model)
    if not owner_table:
        return None

    rows = await repo.list_indent_line_items(db, owner_table=owner_table, owner_id=detail_doc.id, with_remarks=True)
    return [
        {
            "id": row.id,
            "serialNumber": row.serial_number,
            "productId": row.product_id,
            "productName": row.product_name,
            "productDescription": row.product_description,
            "quantity": float(row.quantity) if row.quantity is not None else None,
            "remarks": [
                {"id": r.id, "byName": r.by_name, "role": r.role, "text": r.text, "createdAt": r.created_at}
                for r in row.remarks
            ],
        }
        for row in rows
    ]


async def get_request_detail(db: AsyncSession, current_user: CurrentUser, lookup_value: str) -> dict:
    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found")
    if not can_view_request(current_user, request):
        raise RequestServiceError(403, "Forbidden")
    return await serialize_request(db, request, current_user, include_queries=True)


# ─── Delete ───────────────────────────────────────────────────────────────────


async def delete_request(db: AsyncSession, current_user: CurrentUser, lookup_value: str) -> None:
    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found")
    if request.requester_id != current_user.id:
        raise RequestServiceError(403, "Forbidden")
    await repo.delete_request(db, request)
    await repo.commit(db)


# ─── Route (HOI re-routes an OTHER-category request) ──────────────────────────


async def route_request(db: AsyncSession, current_user: CurrentUser, lookup_value: str, request_category: str) -> dict:
    if current_user.role != "HEAD_OF_INSTITUTION":
        raise RequestServiceError(403, "Only Head of Institution can route requests.")

    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found.")
    if request.stage != "HEAD_OF_INSTITUTION":
        raise RequestServiceError(400, "This request is not currently at the Head of Institution stage.")
    if request.institution != current_user.institution:
        raise RequestServiceError(403, "Unauthorized: Institution mismatch.")
    if request_category not in REQUEST_CATEGORIES:
        raise RequestServiceError(400, "Invalid request category.")

    request.request_category = request_category
    await repo.commit(db)

    request = await repo.get_request_by_lookup(db, lookup_value)
    return await serialize_request(db, request, current_user)


# ─── Update (forward / reject / role-specific fields) ─────────────────────────


ACTION_VALUES = ("approved", "rejected", "forwarded", "created")


async def update_request(
    db: AsyncSession,
    current_user: CurrentUser,
    lookup_value: str,
    *,
    action: str | None,
    comments: str | None,
    rejected_reason: str | None,
    status_update: str | None,
    details_update_payload: dict | None,
    sop_available: bool | None,
    sop_text: str | None,
    sop_id: int | None,
    budget_available: bool | None,
    budget_allocated: float | None,
    budget_spent: float | None,
    budget_remaining: float | None,
    request_category: str | None,
    files: list,
    background_tasks: BackgroundTasks,
) -> dict:
    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found.")

    if not can_view_request(current_user, request):
        raise RequestServiceError(404, "Request not found.")

    if not can_act_on_request(current_user, request):
        message = (
            "You can only modify requests you submitted."
            if current_user.role == "REQUESTER"
            else f"You cannot act on this request while it is at the {request.stage} stage."
        )
        raise RequestServiceError(403, message)

    if request.status != "PENDING" and action != "created":
        raise RequestServiceError(400, "This request has already been finalized and cannot be modified.")

    if action is not None and action not in ACTION_VALUES:
        raise RequestServiceError(400, "action must be one of: approved, rejected, forwarded, created.")

    if files:
        try:
            stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
        except InvalidUploadError as exc:
            raise RequestServiceError(400, str(exc)) from exc

        for f in stored_files:
            repo.add_request_attachment(db, request_id=request.id, file_id=f.id)

    # Rejection (any processing role can reject).
    if action == "rejected":
        safe_reason = (rejected_reason or "").strip()
        if not safe_reason:
            raise RequestServiceError(400, "A reason must be provided when rejecting a request.")
        request.status = "REJECTED"
        request.rejected_reason = safe_reason
        repo.add_action_history(db, RequestActionHistory(request_id=request.id, action_by_id=current_user.id, action="rejected", comments=safe_reason))
        await repo.commit(db)
        request = await repo.get_request_by_lookup(db, lookup_value)
        return await serialize_request(db, request, current_user)

    # CHAIRMAN-only explicit approve/flag.
    if current_user.role == "CHAIRMAN" and status_update in ("APPROVED", "QUERY", "FLAGGED"):
        request.status = status_update
        if status_update == "APPROVED":
            from app.completed.models import Completed

            existing_completed_id = await repo.get_completed_id_for_request(db, request.id)
            if existing_completed_id is None:
                new_completed = Completed(request_id=request.id, completed_status=False)
                repo.add_completed(db, new_completed)
                await repo.flush(db)

                requester = request.requester
                if requester and requester.email:
                    try:
                        await send_request_approval_email(
                            requester.email,
                            requester.name,
                            {
                                "request_id": request.request_id,
                                "title": request.title,
                                "institution": request.institution,
                                "department": request.department,
                                "cost": float(request.cost) if request.cost else None,
                                "completed_id": new_completed.id,
                            },
                        )
                    except Exception:
                        pass

    # SOP fields (Institution Manager) and budget fields (Accountant) — no
    # role restriction per field, matching the source (any stage holder can
    # set them, not just those two roles specifically).
    if sop_available is not None:
        request.sop_available = sop_available
    if sop_text is not None:
        request.sop_text = sop_text
    if sop_id is not None:
        request.sop_id = sop_id
    if budget_available is not None:
        request.budget_available = budget_available
    if budget_allocated is not None:
        request.budget_allocated = budget_allocated
    if budget_spent is not None:
        request.budget_spent = budget_spent
    if budget_remaining is not None:
        request.budget_remaining = budget_remaining

    # Update the nested detail document, if provided.
    if details_update_payload:
        DetailModel = get_detail_model(request.details_model)
        if DetailModel is None:
            raise RequestServiceError(400, "Unsupported detail model for this request.")
        flat_update_payload = flatten_detail_payload(request.details_model, details_update_payload)
        safe_payload = pick_model_fields(DetailModel, flat_update_payload)
        if not safe_payload:
            raise RequestServiceError(400, "detailsUpdatePayload contained no updatable fields for this request type.")
        detail_doc = await repo.get_detail_row(db, DetailModel, request.details_table_id)
        for key, value in safe_payload.items():
            setattr(detail_doc, key, value)

    safe_request_category = request_category if request_category in REQUEST_CATEGORIES else None
    if request_category is not None and current_user.role == "HEAD_OF_INSTITUTION" and request.stage == "HEAD_OF_INSTITUTION":
        if not safe_request_category:
            raise RequestServiceError(400, "Invalid request category.")
        request.request_category = safe_request_category

    # Forwarding: advance stage using category-aware get_next_stage.
    if action == "forwarded":
        effective_category = (
            safe_request_category
            if safe_request_category and current_user.role == "HEAD_OF_INSTITUTION" and request.stage == "HEAD_OF_INSTITUTION"
            else request.request_category
        )
        next_stage = get_next_stage(effective_category, request.stage)

        if request.stage == "INSTITUTION_MANAGER" and not request.cost:
            next_stage = "HEAD_OF_INSTITUTION"

        next_stage = skip_hoi_stage(effective_category, next_stage, request.is_hoi_created)

        if next_stage:
            request.stage = next_stage
            request.working_hrs_taken = 0
            request.stage_arrived_at = datetime.now(timezone.utc)

            # Resolve any outstanding SLA flags since the request moved on.
            await repo.resolve_flags_for_request(db, request.id)
        elif request.stage == "CHAIRMAN" and request.status != "APPROVED":
            raise RequestServiceError(400, "Chairman must explicitly set status to APPROVED to conclude workflow.")
        elif request.stage != "CHAIRMAN":
            raise RequestServiceError(400, "Please route this request to an approval category before forwarding it.")

    safe_action = action if action in ACTION_VALUES else None
    repo.add_action_history(
        db,
        RequestActionHistory(
            request_id=request.id,
            action_by_id=current_user.id,
            action=safe_action,
            comments=(comments or "").strip() or "",
        ),
    )

    await repo.commit(db)
    request = await repo.get_request_by_lookup(db, lookup_value)

    if action == "forwarded" and request.stage:
        forwarded_by_user = await repo.get_user_by_id(db, current_user.id)
        background_tasks.add_task(notify_relevant_users, db, request.stage, request, "forwarded", forwarded_by_user, comments or "")

    return await serialize_request(db, request, current_user)


# ─── Indent details ────────────────────────────────────────────────────────────

INDENT_ROW_FIELDS = ("product_id", "product_name", "product_description", "quantity")


def _indent_row_label(row: dict) -> str:
    return row.get("product_name") or row.get("product_id") or "Item"


async def update_indent_details(
    db: AsyncSession, current_user: CurrentUser, lookup_value: str, indent_rows: list[dict]
) -> dict:
    from app.requests.details.models import IndentChangeLog, IndentLineItem
    from app.requests.details.registry import INDENT_CAPABLE_MODELS

    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found.")
    if request.details_model not in INDENT_CAPABLE_MODELS:
        raise RequestServiceError(400, "This request type does not support indent details.")
    if request.status != "PENDING":
        raise RequestServiceError(400, "This request has been finalized and its indent details cannot be modified.")
    if current_user.role == "REQUESTER":
        raise RequestServiceError(403, "Materials requirement can no longer be edited once the request has been submitted.")
    if request.stage != current_user.role:
        raise RequestServiceError(403, f"You cannot modify materials requirement while the request is at the {request.stage} stage.")
    if is_institution_scoped(request.stage) and not same_institution(request.institution, current_user.institution, current_user.role):
        raise RequestServiceError(403, "Unauthorized: Institution mismatch.")

    DetailModel = get_detail_model(request.details_model)
    detail_doc = await repo.get_detail_row(db, DetailModel, request.details_table_id)
    if detail_doc is None:
        raise RequestServiceError(404, "Detail document not found.")

    owner_table = DETAIL_MODEL_TABLE_NAMES[request.details_model]

    existing_rows_list = await repo.list_indent_line_items(db, owner_table=owner_table, owner_id=detail_doc.id)
    existing_rows = {row.id: row for row in existing_rows_list}

    def _get_field(item: dict, *names: str) -> str:
        """Get field value from item, trying both snake_case and camelCase."""
        for name in names:
            value = item.get(name)
            if value is not None:
                return str(value)
        return ""

    seen_ids: set[int] = set()
    next_rows: list[dict] = []
    for index, item in enumerate(indent_rows):
        row_id = item.get("id")
        quantity = item.get("quantity")
        quantity = float(quantity) if quantity not in (None, "") else 1
        existing = existing_rows.get(row_id) if row_id else None
        if existing:
            seen_ids.add(row_id)
        next_rows.append(
            {
                "id": row_id if existing else None,
                "serial_number": index + 1,
                "product_id": _get_field(item, "product_id", "productId"),
                "product_name": _get_field(item, "product_name", "productName"),
                "product_description": _get_field(item, "product_description", "productDescription"),
                "quantity": quantity,
            }
        )

    change_log_entries: list[dict] = []
    stamp = {"by_user_id": current_user.id, "by_name": current_user.name, "role": current_user.role}

    for row_id, before in existing_rows.items():
        if row_id not in seen_ids:
            change_log_entries.append(
                {
                    **stamp,
                    "action": "deleted",
                    "row_label": before.product_name or before.product_id or "Item",
                    "serial_number": before.serial_number,
                    "product_id": before.product_id,
                }
            )
            await repo.delete_indent_line_item(db, before)

    for row in next_rows:
        before = existing_rows.get(row["id"]) if row["id"] else None
        if before is None:
            new_row = IndentLineItem(
                owner_table=owner_table,
                owner_id=detail_doc.id,
                serial_number=row["serial_number"],
                product_id=row["product_id"],
                product_name=row["product_name"],
                product_description=row["product_description"],
                quantity=row["quantity"],
            )
            repo.add_indent_line_item(db, new_row)
            change_log_entries.append(
                {**stamp, "action": "added", "row_label": _indent_row_label(row), "serial_number": row["serial_number"], "product_id": row["product_id"]}
            )
            continue

        for field in INDENT_ROW_FIELDS:
            old_value = getattr(before, field)
            new_value = row[field]

            changed = False
            if field == "quantity":
                old_float = float(old_value) if old_value not in (None, "") else 0
                new_float = float(new_value) if new_value not in (None, "") else 0
                changed = old_float != new_float
            else:
                changed = str(old_value if old_value is not None else "") != str(new_value if new_value is not None else "")

            if changed:
                change_log_entries.append(
                    {
                        **stamp,
                        "action": "updated",
                        "row_label": _indent_row_label(row),
                        "serial_number": row["serial_number"],
                        "product_id": row["product_id"],
                        "field": field,
                        "old_value": "" if old_value is None else str(old_value),
                        "new_value": "" if new_value is None else str(new_value),
                    }
                )
            setattr(before, field, new_value)
        before.serial_number = row["serial_number"]

    if change_log_entries:
        for entry in change_log_entries:
            repo.add_change_log_entry(db, IndentChangeLog(owner_table=owner_table, owner_id=detail_doc.id, **entry))

    await repo.flush(db)

    if next_rows and not detail_doc.indent_number:
        detail_doc.indent_number = generate_indent_number(request.institution, request.department)

    await repo.commit(db)

    line_items = await _serialize_indent_line_items(db, request, detail_doc)
    change_log_rows = await repo.list_change_log(db, owner_table=owner_table, owner_id=detail_doc.id)
    change_log = [
        {
            "action": c.action,
            "rowLabel": c.row_label,
            "serialNumber": c.serial_number,
            "productId": c.product_id,
            "field": c.field,
            "oldValue": c.old_value,
            "newValue": c.new_value,
            "remark": c.remark,
            "byName": c.by_name,
            "role": c.role,
            "at": c.created_at,
        }
        for c in change_log_rows
    ]

    return {
        "success": True,
        "message": "Materials requirement updated successfully.",
        "data": line_items,
        "change_log": change_log,
        "indent_number": detail_doc.indent_number,
    }


async def add_indent_remark(db: AsyncSession, current_user: CurrentUser, lookup_value: str, row_id: int, text: str) -> dict:
    from app.requests.details.models import IndentRemark
    from app.requests.details.registry import INDENT_CAPABLE_MODELS

    text = (text or "").strip()
    if not text:
        raise RequestServiceError(400, "Remark text is required.")

    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found.")
    if request.details_model not in INDENT_CAPABLE_MODELS:
        raise RequestServiceError(400, "This request type does not support indent details.")
    if current_user.role == "REQUESTER":
        raise RequestServiceError(403, "Only the role currently reviewing this request can add a remark.")
    if request.stage != current_user.role:
        raise RequestServiceError(403, f"You cannot add a remark while the request is at the {request.stage} stage.")
    if is_institution_scoped(request.stage) and not same_institution(request.institution, current_user.institution, current_user.role):
        raise RequestServiceError(403, "Unauthorized: Institution mismatch.")

    row = await repo.get_indent_line_item(db, row_id)
    if row is None:
        raise RequestServiceError(404, "Line item not found.")

    repo.add_indent_remark(db, IndentRemark(line_item_id=row.id, by_user_id=current_user.id, by_name=current_user.name, role=current_user.role, text=text))
    await repo.commit(db)

    detail_doc = await get_detail_document(db, request)
    return {"success": True, "message": "Remark added.", "data": await _serialize_indent_line_items(db, request, detail_doc)}


async def add_change_log_remark(db: AsyncSession, current_user: CurrentUser, lookup_value: str, text: str) -> dict:
    from app.requests.details.registry import INDENT_CAPABLE_MODELS

    text = (text or "").strip()
    if not text:
        raise RequestServiceError(400, "Remark text is required.")

    request = await repo.get_request_by_lookup(db, lookup_value)
    if request is None:
        raise RequestServiceError(404, "Request not found.")
    if request.details_model not in INDENT_CAPABLE_MODELS:
        raise RequestServiceError(400, "This request type does not support indent details.")
    if current_user.role == "REQUESTER":
        raise RequestServiceError(403, "Only the role currently reviewing this request can add change notes.")
    if request.stage != current_user.role:
        raise RequestServiceError(403, f"You cannot add a change note while the request is at the {request.stage} stage.")
    if is_institution_scoped(request.stage) and not same_institution(request.institution, current_user.institution, current_user.role):
        raise RequestServiceError(403, "Unauthorized: Institution mismatch.")

    detail_doc = await get_detail_document(db, request)
    owner_table = DETAIL_MODEL_TABLE_NAMES[request.details_model]

    last_entry = await repo.get_latest_change_log_entry(db, owner_table=owner_table, owner_id=detail_doc.id)
    if last_entry is None:
        raise RequestServiceError(400, "No change log entries found.")

    last_entry.remark = text
    await repo.commit(db)

    return {"success": True, "message": "Change note added."}
