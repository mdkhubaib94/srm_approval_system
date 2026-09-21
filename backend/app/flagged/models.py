from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Flagged(Base):
    __tablename__ = "flagged"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), nullable=False)
    flagged_stage: Mapped[str] = mapped_column(String, nullable=False)
    flag_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    request = relationship("Request")
    flagged_users: Mapped[list["FlaggedUser"]] = relationship(back_populates="flagged", cascade="all, delete-orphan")


class FlaggedUser(Base):
    """Join table replacing Flagged.flaggedAt[] (array of responsible User
    refs at the moment the SLA breach was recorded)."""

    __tablename__ = "flagged_users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    flagged_id: Mapped[int] = mapped_column(ForeignKey("flagged.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)

    flagged: Mapped["Flagged"] = relationship(back_populates="flagged_users")
    user = relationship("User")
