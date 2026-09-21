"""Raw persistence operations for the Queries domain."""

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.helpers import get_with_options
from app.files import repository as files_repository
from app.files.models import QueryAttachment
from app.policies.models import Policy
from app.queries.models import Query
from app.requests.models import Request

LOAD_OPTIONS = (
    # can_view_request (via can_view_query) reads request.action_history when
    # an institution-scoped viewer isn't in the request's own institution —
    # that must be eagerly loaded too, or it lazy-loads on an AsyncSession
    # and crashes with MissingGreenlet. Same reasoning for requester: the
    # "queries resolved" notification background task reads request.requester
    # after the request-scoped session has been handed back, so it must
    # already be loaded rather than lazy-loaded at that point.
    selectinload(Query.request).selectinload(Request.action_history),
    selectinload(Query.request).selectinload(Request.requester),
    selectinload(Query.policy).selectinload(Policy.requester),
    selectinload(Query.raised_by),
    selectinload(Query.query_reply_by),
)


async def list_visible_request_ids(db: AsyncSession, clause) -> list[int]:
    result = await db.execute(select(Request.id).where(clause))
    return result.scalars().all()


async def list_queries_for_requests(db: AsyncSession, request_ids: list[int]) -> list[Query]:
    stmt = (
        select(Query)
        .where(Query.request_id.in_(request_ids))
        .options(selectinload(Query.request), selectinload(Query.raised_by), selectinload(Query.query_reply_by))
        .order_by(Query.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_queries_for_policies(db: AsyncSession) -> list[Query]:
    # Policies are reference material every authenticated staff member can
    # read (see can_view_policy_query), so — unlike requests — there is no
    # per-viewer id filter to apply here.
    stmt = (
        select(Query)
        .where(Query.policy_id.isnot(None))
        .options(selectinload(Query.policy), selectinload(Query.raised_by), selectinload(Query.query_reply_by))
        .order_by(Query.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_query_by_id(db: AsyncSession, query_id: int) -> Query | None:
    return await get_with_options(db, Query, query_id, *LOAD_OPTIONS)


async def get_request_with_action_history(db: AsyncSession, request_id: int) -> Request | None:
    return await get_with_options(db, Request, request_id, selectinload(Request.action_history))


async def get_policy_with_requester(db: AsyncSession, policy_id: int) -> Policy | None:
    return await get_with_options(db, Policy, policy_id, selectinload(Policy.requester))


def add_query(db: AsyncSession, query: Query) -> None:
    db.add(query)


def add_query_attachment(db: AsyncSession, *, query_id: int, file_id: int) -> None:
    db.add(QueryAttachment(query_id=query_id, file_id=file_id))


async def list_attachments(db: AsyncSession, query_id: int) -> list[dict]:
    return await files_repository.list_attachment_files(db, QueryAttachment, QueryAttachment.query_id == query_id)


async def count_other_open_queries(
    db: AsyncSession, *, exclude_query_id: int, request_id: int | None = None, policy_id: int | None = None
) -> int:
    parent_clause = Query.request_id == request_id if request_id is not None else Query.policy_id == policy_id
    result = await db.execute(
        select(func.count())
        .select_from(Query)
        .where(parent_clause, Query.id != exclude_query_id, Query.query_resolved.is_(False))
    )
    return result.scalar_one()


async def commit(db: AsyncSession) -> None:
    await db.commit()
