"""Raw persistence operations for the Auth domain (all against the Users
table — auth has no models of its own)."""

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.users.models import User


async def find_user_by_email(db: AsyncSession, email: str) -> User | None:
    result = await db.execute(select(User).where(User.email == email.strip().lower()))
    return result.scalar_one_or_none()


async def find_user_by_email_or_employee_id(db: AsyncSession, credential: str) -> User | None:
    result = await db.execute(
        select(User).where(or_(User.email == credential.lower(), User.employee_id == credential))
    )
    return result.scalar_one_or_none()


async def find_user_by_id(db: AsyncSession, user_id: int) -> User | None:
    return await db.get(User, user_id)


async def find_user_by_normalized_email_or_employee_id(db: AsyncSession, email: str, employee_id: str) -> User | None:
    """Registration's uniqueness check: `email` is already normalized by the
    caller; `employee_id` is matched as-typed, same as the source."""
    result = await db.execute(select(User).where(or_(User.email == email, User.employee_id == employee_id)))
    return result.scalar_one_or_none()


def add_user(db: AsyncSession, user: User) -> None:
    db.add(user)


async def commit(db: AsyncSession) -> None:
    await db.commit()


async def refresh(db: AsyncSession, user: User) -> None:
    await db.refresh(user)
