from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Completed(Base):
    __tablename__ = "completed"
    __table_args__ = (
        Index("ix_completed_request", "request_id"),
        Index("ix_completed_expected_completion", "expected_completion"),
        Index("ix_completed_completion_date", "completion_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), unique=True, nullable=False)
    expected_completion: Mapped[date | None] = mapped_column(Date, nullable=True)
    completion_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    reason_for_pending: Mapped[str | None] = mapped_column(String, nullable=True)
    completed_status: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    # Set once the overdue-reminder cron has emailed the requester for the
    # current expected_completion, so the reminder fires only once per
    # deadline. Reset to false whenever expected_completion changes, so a
    # pushed-out deadline can warn again.
    overdue_email_sent: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    request = relationship("Request")
