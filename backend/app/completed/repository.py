"""Raw persistence operations for the Completed domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.completed.models import Completed
from app.db.helpers import get_with_options
from app.files import repository as files_repository
from app.files.models import CompletedAttachment
from app.requests.models import Request

# can_view_completed/can_update_completed (via can_view_request) read
# request.action_history when an institution-scoped viewer isn't in the
# request's own institution — must be eagerly loaded or it lazy-loads on an
# AsyncSession and crashes with MissingGreenlet.
LOAD_OPTIONS = [
    selectinload(Completed.request).selectinload(Request.requester),
    selectinload(Completed.request).selectinload(Request.action_history),
]


async def list_completed(db: AsyncSession, *, request_ids: list[int] | None = None) -> list[Completed]:
    stmt = select(Completed).options(*LOAD_OPTIONS).order_by(Completed.updated_at.desc())
    if request_ids is not None:
        stmt = stmt.where(Completed.request_id.in_(request_ids))
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_request_ids_for_requester(db: AsyncSession, requester_id: int) -> list[int]:
    result = await db.execute(select(Request.id).where(Request.requester_id == requester_id))
    return result.scalars().all()


async def list_request_ids_for_institution(db: AsyncSession, institution: str | None) -> list[int]:
    result = await db.execute(select(Request.id).where(Request.institution == institution))
    return result.scalars().all()


async def get_completed_by_id(db: AsyncSession, completed_id: int) -> Completed | None:
    return await get_with_options(db, Completed, completed_id, *LOAD_OPTIONS)


def add_completed_attachment(db: AsyncSession, *, completed_id: int, file_id: int) -> None:
    db.add(CompletedAttachment(completed_id=completed_id, file_id=file_id))


async def list_attachments(db: AsyncSession, completed_id: int) -> list[dict]:
    return await files_repository.list_attachment_files(db, CompletedAttachment, CompletedAttachment.completed_id == completed_id)


async def commit(db: AsyncSession) -> None:
    await db.commit()
