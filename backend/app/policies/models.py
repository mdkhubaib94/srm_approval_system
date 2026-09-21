from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Numeric
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

PolicyApprovalStatusEnum = SAEnum("PENDING", "APPROVED", "REJECTED", name="policy_approval_status")


class Policy(Base):
    __tablename__ = "policies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)
    cost: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    policy_approval_status: Mapped[str] = mapped_column(PolicyApprovalStatusEnum, nullable=False, server_default="PENDING")
    rejected_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    requester = relationship("User")
