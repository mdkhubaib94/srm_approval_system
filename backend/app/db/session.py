from collections.abc import AsyncGenerator

from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_sessionmaker


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI dependency yielding a request-scoped AsyncSession."""
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        yield session
