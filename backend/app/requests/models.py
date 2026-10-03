from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, Numeric
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Integer, String, false, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.requests.workflow import DETAILS_MODEL_NAMES, REQUEST_CATEGORIES

RequestCategoryEnum = SAEnum(*REQUEST_CATEGORIES, name="request_category")
DetailsModelEnum = SAEnum(*DETAILS_MODEL_NAMES, name="details_model")
RequestStatusEnum = SAEnum("PENDING", "APPROVED", "REJECTED", "QUERY", name="request_status")
RequestActionEnum = SAEnum("approved", "rejected", "forwarded", "created", name="request_action")


class Request(Base):
    __tablename__ = "requests"
    __table_args__ = (
        Index("ix_requests_stage_institution", "stage", "institution"),
        Index("ix_requests_requester", "requester_id"),
        Index("ix_requests_category_stage", "request_category", "stage"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    requester_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    request_id: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    institution: Mapped[str] = mapped_column(String, nullable=False)
    department: Mapped[str] = mapped_column(String, nullable=False)

    # Which approval pipeline this request follows — server-derived, never
    # client-chosen (see requests/workflow.py's derive_request_category).
    request_category: Mapped[str] = mapped_column(RequestCategoryEnum, nullable=False)

    # Polymorphic dispatch: details_table_id's actual FK target depends on
    # details_model, resolved via requests/details/registry.py — Postgres has
    # no native "FK against one of 14 tables", same non-enforceable-integrity
    # trade-off Mongoose's refPath already had.
    details_model: Mapped[str] = mapped_column(DetailsModelEnum, nullable=False)
    details_table_id: Mapped[int] = mapped_column(Integer, nullable=False)

    # Current approver role/stage. Deliberately plain String, not a DB enum —
    # validated against workflow.ALL_STAGES/CATEGORY_STAGE_SEQUENCES in
    # application code instead, since it's derived per-category and cheaper
    # to keep in lockstep there than in a second enum type.
    stage: Mapped[str | None] = mapped_column(String, nullable=True)

    status: Mapped[str] = mapped_column(RequestStatusEnum, nullable=False, server_default="PENDING")

    # True when a Head of Institution submitted the request: the HEAD_OF_INSTITUTION
    # approval stage is skipped (they are already the institution's approver).
    is_hoi_created: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default=false(), default=False)

    cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    rejected_reason: Mapped[str | None] = mapped_column(String, nullable=True)

    # Set by the Institution Manager while processing the request
    sop_available: Mapped[bool | None] = mapped_column(nullable=True)
    sop_text: Mapped[str | None] = mapped_column(String, nullable=True)
    sop_id: Mapped[int | None] = mapped_column(ForeignKey("sops.id"), nullable=True)

    # Set by the Accountant during budget verification
    budget_allocated: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    budget_spent: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    budget_remaining: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    budget_available: Mapped[bool | None] = mapped_column(nullable=True)

    working_hrs_taken: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    stage_arrived_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    action_history: Mapped[list["RequestActionHistory"]] = relationship(
        back_populates="request", cascade="all, delete-orphan", order_by="RequestActionHistory.created_at"
    )
    requester = relationship("User")


class RequestActionHistory(Base):
    """Promoted from Request.actionHistory[] (an embedded array in the
    source) to its own table — needed to index/query "requests I acted on"
    the way getUserRequests does."""

    __tablename__ = "request_action_history"
    __table_args__ = (
        Index("ix_request_action_history_request", "request_id"),
        Index("ix_request_action_history_action_by", "action_by_id"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), nullable=False)
    action_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    action: Mapped[str | None] = mapped_column(RequestActionEnum, nullable=True)
    comments: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped["Request"] = relationship(back_populates="action_history")
    action_by = relationship("User")
