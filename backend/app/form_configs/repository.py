"""Raw persistence operations for the FormConfig domain."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.form_configs.models import FormConfig

LOAD_OPTIONS = (selectinload(FormConfig.fields),)


async def list_form_configs(db: AsyncSession) -> list[FormConfig]:
    stmt = select(FormConfig).options(*LOAD_OPTIONS).order_by(FormConfig.request_type)
    result = await db.execute(stmt)
    return result.scalars().all()


async def get_by_request_type(db: AsyncSession, request_type: str) -> FormConfig | None:
    stmt = select(FormConfig).where(FormConfig.request_type == request_type).options(*LOAD_OPTIONS)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_id_by_request_type(db: AsyncSession, request_type: str) -> int | None:
    stmt = select(FormConfig.id).where(FormConfig.request_type == request_type)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_by_id(db: AsyncSession, config_id: int) -> FormConfig:
    stmt = select(FormConfig).where(FormConfig.id == config_id).options(*LOAD_OPTIONS)
    return (await db.execute(stmt)).scalar_one()


def add_form_config(db: AsyncSession, config: FormConfig) -> None:
    db.add(config)


async def delete_form_config(db: AsyncSession, config: FormConfig) -> None:
    await db.delete(config)


async def commit(db: AsyncSession) -> None:
    await db.commit()
