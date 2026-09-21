"""Raw persistence operations for the Flagged (SLA-breach) domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.helpers import get_with_options
from app.flagged.models import Flagged, FlaggedUser
from app.requests.models import Request, RequestActionHistory

LOAD_OPTIONS = [
    selectinload(Flagged.request).selectinload(Request.requester),
    selectinload(Flagged.flagged_users).selectinload(FlaggedUser.user),
]


async def list_flagged(db: AsyncSession, stmt) -> list[Flagged]:
    """`stmt` is a fully-built select(Flagged)... statement — role-scoped
    filtering varies per caller and stays in the service layer, this just
    executes it."""
    result = await db.execute(stmt)
    return result.scalars().unique().all()


def base_flagged_statement():
    return (
        select(Flagged)
        .options(*LOAD_OPTIONS, selectinload(Flagged.request).selectinload(Request.action_history))
        .join(Request, Flagged.request_id == Request.id)
        .where(Request.status == "PENDING")
    )


async def get_flagged_by_id(db: AsyncSession, flagged_id: int) -> Flagged | None:
    return await get_with_options(
        db,
        Flagged,
        flagged_id,
        *LOAD_OPTIONS,
        selectinload(Flagged.request).selectinload(Request.action_history).selectinload(RequestActionHistory.action_by),
    )


async def get_flagged_with_requester(db: AsyncSession, flagged_id: int) -> Flagged | None:
    return await get_with_options(db, Flagged, flagged_id, selectinload(Flagged.request).selectinload(Request.requester))


async def get_flagged_basic(db: AsyncSession, flagged_id: int) -> Flagged | None:
    return await get_with_options(db, Flagged, flagged_id, *LOAD_OPTIONS)


async def get_request_full(db: AsyncSession, request_id: int) -> Request | None:
    return await get_with_options(
        db,
        Request,
        request_id,
        selectinload(Request.requester),
        selectinload(Request.action_history).selectinload(RequestActionHistory.action_by),
    )


def add_action_history(db: AsyncSession, entry: RequestActionHistory) -> None:
    db.add(entry)


async def commit(db: AsyncSession) -> None:
    await db.commit()
