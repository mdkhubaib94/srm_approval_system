"""ORM models for dynamic request-creation form configuration. Port of
src/models/FormConfig.js.

The source's `fields` was a Mongoose array of embedded subdocuments; this
codebase's convention (see app/models/request_details_models.py's
IndentLineItem) is to normalize embedded arrays into a real child table
rather than a JSON blob, so `options` is the only piece kept as a Postgres
array (it's a short, order-sensitive list of plain strings with no further
structure) and `fields` becomes FormConfigField rows ordered by `position`.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Boolean, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

FormFieldTypeEnum = SAEnum("text", "number", "textarea", "select", "date", "file", "tableObject", name="form_field_type")


class FormConfig(Base):
    __tablename__ = "form_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_type: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    title: Mapped[str] = mapped_column(String, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    fields: Mapped[list["FormConfigField"]] = relationship(
        "FormConfigField", back_populates="form_config", cascade="all, delete-orphan", order_by="FormConfigField.position"
    )


class FormConfigField(Base):
    __tablename__ = "form_config_fields"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    form_config_id: Mapped[int] = mapped_column(ForeignKey("form_configs.id", ondelete="CASCADE"), nullable=False, index=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False)

    name: Mapped[str] = mapped_column(String, nullable=False)
    label: Mapped[str] = mapped_column(String, nullable=False)
    field_type: Mapped[str] = mapped_column(FormFieldTypeEnum, nullable=False)
    required: Mapped[bool] = mapped_column(Boolean, nullable=False, server_default="false")
    options: Mapped[list[str] | None] = mapped_column(ARRAY(String), nullable=True)

    validation_min: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    validation_max: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    validation_regex: Mapped[str | None] = mapped_column(String, nullable=True)

    form_config = relationship("FormConfig", back_populates="fields")
