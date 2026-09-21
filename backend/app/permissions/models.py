from sqlalchemy import Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class RolePermission(Base):
    """A role's grant for a named permission — currently just
    "download_attachments" (see app.permissions.service.DOWNLOAD_ATTACHMENTS).
    Presence of a (permission_key, role) row means that role has the grant;
    absence means it doesn't."""

    __tablename__ = "role_permissions"
    __table_args__ = (UniqueConstraint("permission_key", "role", name="uq_role_permissions_key_role"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    permission_key: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, nullable=False)
