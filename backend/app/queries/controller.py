from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.core.multipart import parse_form_or_json
from app.db.session import get_db
from app.queries import service

router = APIRouter(prefix="/queries", tags=["queries"])


def _raise(exc: service.QueryServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


@router.get("")
async def get_all_queries(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.list_all_queries(db, current_user)
    except service.QueryServiceError as exc:
        _raise(exc)


@router.get("/{query_id}")
async def get_query_by_id(query_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_query(db, current_user, query_id)
    except service.QueryServiceError as exc:
        _raise(exc)


@router.post("", status_code=201)
async def create_query(body: dict, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    raw_reply_by = body.get("queryReplyBy")
    if raw_reply_by is None:
        raw_reply_by = body.get("query_reply_by")

    # queryReplyBy names the user expected to answer; it must be a real id,
    # not an arbitrary value written straight into the row.
    query_reply_by = None
    if raw_reply_by not in (None, ""):
        try:
            query_reply_by = int(raw_reply_by)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="queryReplyBy must be a valid user id.")

    try:
        return await service.create_query(
            db,
            current_user,
            request_ref=body.get("request"),
            policy_ref=body.get("policy"),
            query_text=body.get("query"),
            query_reply_by=query_reply_by,
        )
    except service.QueryServiceError as exc:
        _raise(exc)


@router.patch("/{query_id}")
async def update_query(
    query_id: int,
    request: Request,
    background_tasks: BackgroundTasks,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # This route accepts either a JSON body (a reply with no new attachment)
    # or multipart/form-data (a reply that attaches files) — same either-or
    # contract as the source's express.json() + multer combination.
    fields, attachments = await parse_form_or_json(request)

    query_reply = fields.get("queryReply") or fields.get("query_reply")
    raw_resolved = fields.get("queryResolved")
    if raw_resolved is None:
        raw_resolved = fields.get("query_resolved")

    resolved = None
    if raw_resolved is not None:
        resolved = raw_resolved is True or raw_resolved == "true"

    try:
        return await service.update_query(
            db,
            current_user,
            query_id,
            query_reply=query_reply,
            query_resolved=resolved,
            files=attachments,
            background_tasks=background_tasks,
        )
    except service.QueryServiceError as exc:
        _raise(exc)
