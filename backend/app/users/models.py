from sqlalchemy import Enum as SAEnum
from sqlalchemy import Index, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.rbac import ROLES
from app.db.base import Base

UserRoleEnum = SAEnum(*ROLES, name="user_role")


class User(Base):
    __tablename__ = "users"
    __table_args__ = (Index("ix_users_role_institution", "role", "institution"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    employee_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    email: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    phone: Mapped[str | None] = mapped_column(String, nullable=True)
    password_hash: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(UserRoleEnum, nullable=False, server_default="REQUESTER")
    # Free text / open vocabulary by design — see user.constants.js's own
    # comment that department lists vary per institution and evolve over
    # time. Do not promote either of these to a DB enum.
    institution: Mapped[str | None] = mapped_column(String, nullable=True)
    department: Mapped[str | None] = mapped_column(String, nullable=True)
    # Bumped on logout and on password reset to invalidate every refresh
    # token issued before that point (see core/security.py sign_refresh_token
    # and services/auth_service.py). This is the entire revocation mechanism
    # — there is no server-side token blacklist otherwise.
    token_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
