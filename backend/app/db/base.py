from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.config import get_settings


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


_engine: AsyncEngine | None = None
_sessionmaker: async_sessionmaker | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(get_settings().database_url, pool_pre_ping=True)
    return _engine


def get_sessionmaker() -> async_sessionmaker:
    global _sessionmaker
    if _sessionmaker is None:
        _sessionmaker = async_sessionmaker(bind=get_engine(), expire_on_commit=False)
    return _sessionmaker
