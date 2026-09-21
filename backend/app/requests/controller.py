import json

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.core.multipart import parse_form_or_json
from app.db.session import get_db
from app.requests.details.nesting import flatten_detail_payload
from app.requests.schemas import DETAIL_PAYLOAD_SCHEMAS
from app.requests.workflow import REQUEST_CATEGORIES, derive_request_category
from app.requests import service

router = APIRouter(prefix="/requests", tags=["requests"])


def _raise(exc: service.RequestServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


def _field(fields: dict, *names: str) -> str | None:
    """First non-None value found under any of `names` — FastAPI's
    Form(..., alias=...)/validation_alias does NOT actually accept an
    incoming field under any name but its own for multipart bodies (verified
    against a real request), so every dual-cased field name is looked up by
    hand instead of declared as a Form() parameter."""
    for name in names:
        value = fields.get(name)
        if value is not None:
            return value
    return None


# ─── Create ───────────────────────────────────────────────────────────────────


@router.post("", status_code=201)
async def create_request(
    background_tasks: BackgroundTasks,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fields, attachments = await parse_form_or_json(http_request)

    title = _field(fields, "title")
    description = _field(fields, "description")
    department = _field(fields, "department")
    comments = _field(fields, "comments")
    details_model = _field(fields, "details_model", "detailsModel")
    details_payload_raw = _field(fields, "details_payload", "detailsPayload")
    sop = _field(fields, "sop", "SOP")
    sop_id_raw = _field(fields, "sop_id", "sopId")
    cost_estimate_raw = _field(fields, "cost_estimate", "costEstimate")

    if not title or not department:
        raise HTTPException(400, "Missing required fields")
    if not details_model or not details_payload_raw:
        raise HTTPException(400, "detailsModel and detailsPayload are required")

    sop_id = int(sop_id_raw) if sop_id_raw not in (None, "") else None
    cost_estimate = float(cost_estimate_raw) if cost_estimate_raw not in (None, "") else None

    try:
        raw_payload = json.loads(details_payload_raw)
    except json.JSONDecodeError:
        raise HTTPException(400, "Invalid detailsPayload: must be valid JSON")
    if not isinstance(raw_payload, dict):
        raise HTTPException(400, "Invalid detailsPayload: must be valid JSON")

    flat_payload = flatten_detail_payload(details_model, raw_payload)

    general_category = flat_payload.get("general_category")
    request_category = derive_request_category(details_model, general_category)
    if not request_category or request_category not in REQUEST_CATEGORIES:
        message = (
            "A valid generalCategory is required to determine the approval flow for General requests"
            if details_model == "GeneralDetail"
            else f"Unable to determine approval category for request type: {details_model}"
        )
        raise HTTPException(400, message)

    schema_cls = DETAIL_PAYLOAD_SCHEMAS.get(details_model)
    if schema_cls is None:
        raise HTTPException(400, "Invalid or unsupported detail model type.")

    try:
        validated_payload = schema_cls(**flat_payload).model_dump()
    except ValidationError as exc:
        raise HTTPException(400, f"Invalid detailsPayload: {exc.errors()[0]['msg']}")

    try:
        request = await service.create_request(
            db,
            current_user,
            title=title,
            description=description,
            department=department,
            comments=comments,
            details_model=details_model,
            details_payload=validated_payload,
            sop_text=sop,
            sop_id=sop_id,
            cost_estimate=cost_estimate,
            files=attachments,
            background_tasks=background_tasks,
        )
    except service.RequestServiceError as exc:
        _raise(exc)

    return await service.serialize_request(db, request, current_user)


# ─── Listing ──────────────────────────────────────────────────────────────────


@router.get("/all")
async def get_all_requests(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        requests = await service.list_all_requests(db, current_user)
    except service.RequestServiceError as exc:
        _raise(exc)
    return [await service.serialize_request(db, r, current_user, include_detail=False) for r in requests]


@router.get("")
async def get_user_requests(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        requests = await service.list_user_requests(db, current_user)
    except service.RequestServiceError as exc:
        _raise(exc)
    data = [await service.serialize_request(db, r, current_user) for r in requests]
    return {"success": True, "count": len(data), "data": data}


@router.get("/{request_id}")
async def get_request_by_id(
    request_id: str, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    try:
        return await service.get_request_detail(db, current_user, request_id)
    except service.RequestServiceError as exc:
        _raise(exc)


# ─── Route (HOI re-routes an OTHER-category request) ──────────────────────────


@router.post("/{request_id}/route")
async def route_request(
    request_id: str,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        data = await service.route_request(db, current_user, request_id, body.get("requestCategory") or body.get("request_category"))
    except service.RequestServiceError as exc:
        _raise(exc)
    return {"success": True, "message": "Request routed successfully.", "data": data}


# ─── Update (forward / reject / role fields) ──────────────────────────────────


@router.patch("/{request_id}")
async def update_request(
    request_id: str,
    background_tasks: BackgroundTasks,
    http_request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fields, attachments = await parse_form_or_json(http_request)

    action = _field(fields, "action")
    comments = _field(fields, "comments")
    rejected_reason = _field(fields, "rejected_reason", "rejectedReason")
    status_update = _field(fields, "status_update", "statusUpdate")
    request_category = _field(fields, "request_category", "requestCategory")
    sop_available = _field(fields, "sop_available", "SOPAvailable")
    sop = _field(fields, "sop", "SOP")
    sop_id_raw = _field(fields, "sop_id", "sopId")
    budget_available = _field(fields, "budget_available", "budgetAvailable")
    budget_allocated_raw = _field(fields, "budget_allocated", "budgetAllocated")
    budget_spent_raw = _field(fields, "budget_spent", "budgetSpent")
    budget_remaining_raw = _field(fields, "budget_remaining", "budgetRemaining")
    details_update_payload = _field(fields, "details_update_payload", "detailsUpdatePayload")

    sop_id = int(sop_id_raw) if sop_id_raw not in (None, "") else None
    budget_allocated = float(budget_allocated_raw) if budget_allocated_raw not in (None, "") else None
    budget_spent = float(budget_spent_raw) if budget_spent_raw not in (None, "") else None
    budget_remaining = float(budget_remaining_raw) if budget_remaining_raw not in (None, "") else None

    parsed_details_update = None
    if details_update_payload:
        try:
            parsed_details_update = json.loads(details_update_payload)
        except json.JSONDecodeError:
            raise HTTPException(400, "Invalid detailsUpdatePayload: must be valid JSON")

    def _as_bool(value: str | None) -> bool | None:
        if value is None:
            return None
        return value == "true" or value is True

    try:
        data = await service.update_request(
            db,
            current_user,
            request_id,
            action=action,
            comments=comments,
            rejected_reason=rejected_reason,
            status_update=status_update,
            details_update_payload=parsed_details_update,
            sop_available=_as_bool(sop_available),
            sop_text=sop,
            sop_id=sop_id,
            budget_available=_as_bool(budget_available),
            budget_allocated=budget_allocated,
            budget_spent=budget_spent,
            budget_remaining=budget_remaining,
            request_category=request_category,
            files=attachments,
            background_tasks=background_tasks,
        )
    except service.RequestServiceError as exc:
        _raise(exc)

    return {"success": True, "message": f"Request processed successfully. Current stage: {data['stage']}", "data": data}


@router.delete("/{request_id}")
async def delete_request(
    request_id: str, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)
):
    try:
        await service.delete_request(db, current_user, request_id)
    except service.RequestServiceError as exc:
        _raise(exc)
    return {"message": "Request deleted successfully"}


# ─── Indent details ────────────────────────────────────────────────────────────


@router.patch("/{request_id}/indent-details")
async def update_indent_details(
    request_id: str,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    indent_details = body.get("indentDetails") or body.get("indent_details")
    if not isinstance(indent_details, list):
        raise HTTPException(400, "indentDetails must be an array.")
    try:
        return await service.update_indent_details(db, current_user, request_id, indent_details)
    except service.RequestServiceError as exc:
        _raise(exc)


@router.post("/{request_id}/indent-details/{row_id}/remarks")
async def add_indent_remark(
    request_id: str,
    row_id: int,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.add_indent_remark(db, current_user, request_id, row_id, body.get("text"))
    except service.RequestServiceError as exc:
        _raise(exc)


@router.post("/{request_id}/indent-details/add-change-log-remark")
async def add_change_log_remark(
    request_id: str,
    body: dict,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        return await service.add_change_log_remark(db, current_user, request_id, body.get("text"))
    except service.RequestServiceError as exc:
        _raise(exc)
