from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def get_with_options(db: AsyncSession, model, pk, *options):
    """Load `model` by primary key with eager-load `options` that are
    guaranteed to actually apply.

    AsyncSession.get(model, pk, options=[...]) silently ignores `options`
    whenever the row is already in the session's identity map (a well-known
    SQLAlchemy pitfall — `get()` only issues a query, and therefore only
    applies loader options, when the object isn't already cached). A plain
    `select(...).options(...)` always issues its query and always applies
    the options, so relationships end up loaded regardless of what else has
    touched this session already — avoiding a `MissingGreenlet` crash the
    moment code later touches an unloaded relationship attribute.
    """
    stmt = select(model).where(model.id == pk)
    if options:
        stmt = stmt.options(*options)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()
