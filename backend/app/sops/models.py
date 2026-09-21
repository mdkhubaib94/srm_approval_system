"""SOP + SopChunk. Direct port of src/models/Sop.js. Embeddings are stored as
plain Postgres arrays (float8[]) rather than a pgvector `vector` column —
the on-prem target Postgres has no extension-install access, so similarity
search is computed in Python (see app/sops/search_service.py) instead of via
a SQL `ORDER BY embedding <=> query_vector` with an ANN index. At the
project's corpus scale (a few hundred SOPs/chunks) this costs nothing
noticeable.
"""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Float, Index
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Integer, String, func, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

EMBEDDING_DIM = 384

DocIndexStatusEnum = SAEnum("pending", "processing", "done", "failed", "no_document", name="sop_doc_index_status")
ExtractionMethodEnum = SAEnum("text", "ocr", name="sop_extraction_method")
ChunkSourceEnum = SAEnum("description", "document", name="sop_chunk_source")


class Sop(Base):
    __tablename__ = "sops"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    reference_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(String, nullable=False)

    # Local embedding of title + description. Never sent to clients — the
    # response serializer omits it, mirroring the source's `select: false`.
    description_embedding: Mapped[list[float] | None] = mapped_column(ARRAY(Float), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String, nullable=True)

    doc_index_status: Mapped[str] = mapped_column(DocIndexStatusEnum, nullable=False, server_default="pending")
    extraction_method: Mapped[str | None] = mapped_column(ExtractionMethodEnum, nullable=True)
    doc_index_error: Mapped[str | None] = mapped_column(String, nullable=True)
    doc_indexed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False)
    is_active: Mapped[bool] = mapped_column(nullable=False, server_default="true")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    created_by = relationship("User")
    chunks: Mapped[list["SopChunk"]] = relationship(back_populates="sop", cascade="all, delete-orphan")


class SopChunk(Base):
    """Embedded chunks of the SOP document's text content (from the PDF text
    layer or OCR). Each chunk carries its own vector so /sops/analyze can
    match against the actual document, not just the hand-written
    description."""

    __tablename__ = "sop_chunks"
    __table_args__ = (
        Index("ix_sop_chunks_text_tsv", text("to_tsvector('english', text)"), postgresql_using="gin"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sop_id: Mapped[int] = mapped_column(ForeignKey("sops.id"), nullable=False)
    text: Mapped[str] = mapped_column(String, nullable=False)
    embedding: Mapped[list[float] | None] = mapped_column(ARRAY(Float), nullable=True)
    page: Mapped[int | None] = mapped_column(Integer, nullable=True)
    source: Mapped[str] = mapped_column(ChunkSourceEnum, nullable=False, server_default="document")

    sop: Mapped["Sop"] = relationship(back_populates="chunks")
