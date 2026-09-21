"""Raw persistence operations for the Requests domain (including the
polymorphic detail rows and the shared indent tables)."""

from sqlalchemy import or_, select
from sqlalchemy import update as sa_update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.completed.models import Completed
from app.files import repository as files_repository
from app.flagged.models import Flagged
from app.users import repository as users_repository
from app.requests.details.models import IndentChangeLog, IndentLineItem, IndentRemark
from app.requests.models import Request, RequestActionHistory
from app.users.models import User


def build_request_lookup_clause(value: str | None):
    """The equivalent of buildRequestLookup for a Postgres integer PK
    instead of a Mongo ObjectId: match the human request_id, or the numeric
    primary key if `value` looks like one. Returns None for anything that
    isn't a usable scalar, so callers 404 instead of querying with garbage.
    """
    if not isinstance(value, str):
        return None
    trimmed = value.strip()
    if not trimmed:
        return None
    if trimmed.isdigit():
        return or_(Request.request_id == trimmed, Request.id == int(trimmed))
    return Request.request_id == trimmed


async def get_request_by_lookup(db: AsyncSession, value: str | None) -> Request | None:
    clause = build_request_lookup_clause(value)
    if clause is None:
        return None
    stmt = (
        select(Request)
        .where(clause)
        .options(
            selectinload(Request.action_history).selectinload(RequestActionHistory.action_by),
            selectinload(Request.requester),
        )
    )
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


async def list_stage_users(db: AsyncSession, stage: str, *, institution: str | None = None) -> list[User]:
    stmt = select(User).where(User.role == stage)
    if institution is not None:
        stmt = stmt.where(User.institution == institution)
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_all_requests(db: AsyncSession) -> list[Request]:
    stmt = select(Request).options(
        selectinload(Request.requester),
        selectinload(Request.action_history).selectinload(RequestActionHistory.action_by),
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_visible_requests(db: AsyncSession, clause) -> list[Request]:
    stmt = (
        select(Request)
        .where(clause, Request.status != "QUERY")
        .order_by(Request.updated_at.desc())
        .options(
            selectinload(Request.requester),
            selectinload(Request.action_history).selectinload(RequestActionHistory.action_by),
        )
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await users_repository.get_user_by_id(db, user_id)


async def get_detail_row(db: AsyncSession, detail_model, table_id: int):
    return await db.get(detail_model, table_id)


def add_detail_row(db: AsyncSession, detail_row) -> None:
    db.add(detail_row)


def add_request(db: AsyncSession, request: Request) -> None:
    db.add(request)


def add_action_history(db: AsyncSession, entry: RequestActionHistory) -> None:
    db.add(entry)


def add_request_attachment(db: AsyncSession, *, request_id: int, file_id: int) -> None:
    from app.files.models import RequestAttachment

    db.add(RequestAttachment(request_id=request_id, file_id=file_id))


async def list_attachments(db: AsyncSession, request_id: int) -> list[dict]:
    from app.files.models import RequestAttachment

    return await files_repository.list_attachment_files(db, RequestAttachment, RequestAttachment.request_id == request_id)


async def get_sop_summary(db: AsyncSession, sop_id: int) -> dict | None:
    """The equivalent of Mongoose's
    `.populate('sopId', 'referenceNumber title description attachments')`."""
    from app.sops import repository as sops_repository
    from app.sops.models import Sop

    sop = await db.get(Sop, sop_id)
    if sop is None:
        return None
    attachments = await sops_repository.list_attachments(db, sop_id)
    return {
        "id": sop.id,
        "reference_number": sop.reference_number,
        "title": sop.title,
        "description": sop.description,
        "attachments": attachments,
    }


async def list_query_attachments(db: AsyncSession, query_id: int) -> list[dict]:
    from app.queries import repository as queries_repository

    return await queries_repository.list_attachments(db, query_id)


async def list_queries_for_request(db: AsyncSession, request_id: int) -> list:
    from app.queries.models import Query

    stmt = (
        select(Query)
        .where(Query.request_id == request_id)
        .options(selectinload(Query.raised_by), selectinload(Query.query_reply_by))
        .order_by(Query.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_completed_id_for_request(db: AsyncSession, request_id: int) -> int | None:
    result = await db.execute(select(Completed.id).where(Completed.request_id == request_id))
    return result.scalar_one_or_none()


def add_completed(db: AsyncSession, completed: Completed) -> None:
    db.add(completed)


async def resolve_flags_for_request(db: AsyncSession, request_id: int) -> None:
    """Resolve any outstanding SLA flags since the request moved on."""
    await db.execute(
        sa_update(Flagged).where(Flagged.request_id == request_id, Flagged.flag_resolved.is_(False)).values(flag_resolved=True)
    )


async def list_indent_line_items(db: AsyncSession, *, owner_table: str, owner_id: int, with_remarks: bool = False) -> list[IndentLineItem]:
    stmt = select(IndentLineItem).where(IndentLineItem.owner_table == owner_table, IndentLineItem.owner_id == owner_id)
    if with_remarks:
        stmt = stmt.options(selectinload(IndentLineItem.remarks)).order_by(IndentLineItem.serial_number)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_indent_line_item(db: AsyncSession, row_id: int) -> IndentLineItem | None:
    return await db.get(IndentLineItem, row_id)


def add_indent_line_item(db: AsyncSession, item: IndentLineItem) -> None:
    db.add(item)


async def delete_indent_line_item(db: AsyncSession, item: IndentLineItem) -> None:
    await db.delete(item)


def add_indent_remark(db: AsyncSession, remark: IndentRemark) -> None:
    db.add(remark)


def add_change_log_entry(db: AsyncSession, entry: IndentChangeLog) -> None:
    db.add(entry)


async def list_change_log(db: AsyncSession, *, owner_table: str, owner_id: int) -> list[IndentChangeLog]:
    result = await db.execute(
        select(IndentChangeLog)
        .where(IndentChangeLog.owner_table == owner_table, IndentChangeLog.owner_id == owner_id)
        .order_by(IndentChangeLog.created_at)
    )
    return result.scalars().all()


async def get_latest_change_log_entry(db: AsyncSession, *, owner_table: str, owner_id: int) -> IndentChangeLog | None:
    result = await db.execute(
        select(IndentChangeLog)
        .where(IndentChangeLog.owner_table == owner_table, IndentChangeLog.owner_id == owner_id)
        .order_by(IndentChangeLog.created_at.desc())
        .limit(1)
    )
    return result.scalar_one_or_none()


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def commit(db: AsyncSession) -> None:
    await db.commit()


async def refresh(db: AsyncSession, obj) -> None:
    await db.refresh(obj)


async def delete_request(db: AsyncSession, request: Request) -> None:
    await db.delete(request)
