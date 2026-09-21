"""Raw persistence operations for role -> permission grants."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.permissions.models import RolePermission


async def get_roles_for_key(db: AsyncSession, permission_key: str) -> list[str]:
    result = await db.execute(select(RolePermission.role).where(RolePermission.permission_key == permission_key))
    return [row[0] for row in result.all()]


async def replace_roles_for_key(db: AsyncSession, permission_key: str, roles: list[str]) -> None:
    await db.execute(delete(RolePermission).where(RolePermission.permission_key == permission_key))
    for role in roles:
        db.add(RolePermission(permission_key=permission_key, role=role))
    await db.commit()
