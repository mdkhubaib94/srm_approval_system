"""Raw persistence operations for the Users domain. No business rules or
permission checks here — see app/services/users_service.py for those."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User


async def get_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def get_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email))
    return result.scalar_one_or_none()


async def get_user_by_employee_id_or_email(db: AsyncSession, employee_id: str, email: str) -> User | None:
    result = await db.execute(select(User).where(or_(User.employee_id == employee_id, User.email == email)))
    return result.scalar_one_or_none()


async def get_user_by_email_excluding_id(db: AsyncSession, email: str, exclude_id: int) -> User | None:
    result = await db.execute(select(User).where(User.email == email, User.id != exclude_id))
    return result.scalar_one_or_none()


async def list_users_by_roles(db: AsyncSession, roles: list[str], *, institution: str | None = None) -> list[User]:
    stmt = select(User).where(User.role.in_(roles))
    if institution is not None:
        stmt = stmt.where(User.institution == institution)
    result = await db.execute(stmt)
    return result.scalars().all()


def add_user(db: AsyncSession, user: User) -> None:
    db.add(user)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def rollback(db: AsyncSession) -> None:
    await db.rollback()


async def commit(db: AsyncSession) -> None:
    await db.commit()


async def refresh(db: AsyncSession, user: User) -> None:
    await db.refresh(user)


async def delete_user(db: AsyncSession, user: User) -> None:
    await db.delete(user)
