"""Raw persistence operations for the Policies domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.helpers import get_with_options
from app.files import repository as files_repository
from app.files.models import PolicyAttachment
from app.policies.models import Policy

LOAD_OPTIONS = (selectinload(Policy.requester),)


async def get_policy_by_id(db: AsyncSession, policy_id: int) -> Policy | None:
    return await get_with_options(db, Policy, policy_id, *LOAD_OPTIONS)


async def list_policies(db: AsyncSession, *, requester_id: int | None = None) -> list[Policy]:
    stmt = select(Policy).options(*LOAD_OPTIONS).order_by(Policy.created_at.desc())
    if requester_id is not None:
        stmt = stmt.where(Policy.requester_id == requester_id)
    result = await db.execute(stmt)
    return result.scalars().all()


def add_policy(db: AsyncSession, policy: Policy) -> None:
    db.add(policy)


def add_policy_attachment(db: AsyncSession, *, policy_id: int, file_id: int) -> None:
    db.add(PolicyAttachment(policy_id=policy_id, file_id=file_id))


async def list_attachments(db: AsyncSession, policy_id: int) -> list[dict]:
    return await files_repository.list_attachment_files(db, PolicyAttachment, PolicyAttachment.policy_id == policy_id)


async def list_queries_for_policy(db: AsyncSession, policy_id: int) -> list:
    from app.queries.models import Query

    stmt = (
        select(Query)
        .where(Query.policy_id == policy_id)
        .options(selectinload(Query.raised_by), selectinload(Query.query_reply_by))
        .order_by(Query.created_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


async def list_query_attachments(db: AsyncSession, query_id: int) -> list[dict]:
    from app.queries import repository as queries_repository

    return await queries_repository.list_attachments(db, query_id)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def commit(db: AsyncSession) -> None:
    await db.commit()
