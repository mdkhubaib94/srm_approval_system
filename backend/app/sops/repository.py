"""Raw persistence operations for the SOPs domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.helpers import get_with_options
from app.files import repository as files_repository
from app.files.models import SopAttachment
from app.sops.models import Sop, SopChunk

LOAD_OPTIONS = (selectinload(Sop.created_by), selectinload(Sop.chunks))


async def list_active_sops(db: AsyncSession) -> list[Sop]:
    stmt = select(Sop).where(Sop.is_active.is_(True)).options(*LOAD_OPTIONS).order_by(Sop.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_sop_by_id(db: AsyncSession, sop_id: int) -> Sop | None:
    return await get_with_options(db, Sop, sop_id, *LOAD_OPTIONS)


async def get_sop_plain(db: AsyncSession, sop_id: int) -> Sop | None:
    return await db.get(Sop, sop_id)


async def get_sop_id_by_reference_number(db: AsyncSession, reference_number: str, *, exclude_id: int | None = None) -> int | None:
    stmt = select(Sop.id).where(Sop.reference_number == reference_number)
    if exclude_id is not None:
        stmt = stmt.where(Sop.id != exclude_id)
    return (await db.execute(stmt)).scalar_one_or_none()


def add_sop(db: AsyncSession, sop: Sop) -> None:
    db.add(sop)


def add_sop_attachment(db: AsyncSession, *, sop_id: int, file_id: int) -> None:
    db.add(SopAttachment(sop_id=sop_id, file_id=file_id))


async def list_sop_attachments(db: AsyncSession, sop_id: int) -> list[SopAttachment]:
    result = await db.execute(select(SopAttachment).where(SopAttachment.sop_id == sop_id))
    return result.scalars().all()


async def list_attachments(db: AsyncSession, sop_id: int) -> list[dict]:
    return await files_repository.list_attachment_files(db, SopAttachment, SopAttachment.sop_id == sop_id)


async def delete_attachment(db: AsyncSession, attachment: SopAttachment) -> None:
    await db.delete(attachment)


async def delete_chunk(db: AsyncSession, chunk: SopChunk) -> None:
    await db.delete(chunk)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def commit(db: AsyncSession) -> None:
    await db.commit()
