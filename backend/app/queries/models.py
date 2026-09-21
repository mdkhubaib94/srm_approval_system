from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
# Imported directly (not just referenced by string in the relationship()
# below) so that merely loading this module guarantees Policy is registered
# in the declarative registry first. Without this, whichever domain happens
# to trigger SQLAlchemy's mapper configuration first — via an unrelated
# selectinload() elsewhere, before anything has imported app.policies.models
# — fails to resolve the "Policy" name.
from app.policies.models import Policy  # noqa: F401


class Query(Base):
    __tablename__ = "queries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    # Exactly one of request_id/policy_id is set — enforced by a DB check
    # constraint (ck_queries_exactly_one_parent), since a query is always
    # raised against either a Request or a Policy, never both/neither.
    request_id: Mapped[int | None] = mapped_column(ForeignKey("requests.id"), nullable=True)
    policy_id: Mapped[int | None] = mapped_column(ForeignKey("policies.id"), nullable=True)
    raised_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    query: Mapped[str] = mapped_column(String, nullable=False)
    query_reply: Mapped[str | None] = mapped_column(String, nullable=True)
    query_reply_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    query_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    request = relationship("Request")
    policy = relationship("Policy")
    raised_by = relationship("User", foreign_keys=[raised_by_id])
    query_reply_by = relationship("User", foreign_keys=[query_reply_by_id])
