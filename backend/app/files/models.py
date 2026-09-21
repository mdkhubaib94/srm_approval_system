from datetime import datetime

from sqlalchemy import BigInteger, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class StoredFile(Base):
    """Metadata row for a file saved to local disk storage.

    Replaces the source's single shared GridFS bucket: the actual bytes live
    on disk at `path_on_disk` (server-generated, never the client's original
    filename — see files/storage.py), and every owning entity (requests,
    policies, queries, completions, sops) references rows here via its own
    join table, mirroring how the source's owning documents each carry
    {fileId, filename, mimetype, uploadedAt} pointing into one GridFS bucket.
    """

    __tablename__ = "files"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    path_on_disk: Mapped[str] = mapped_column(String, nullable=False)
    original_filename: Mapped[str] = mapped_column(String, nullable=False)
    mimetype: Mapped[str] = mapped_column(String, nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    uploaded_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class RequestAttachment(Base):
    """Join table: request_attachments. Port of Request.attachments[]."""

    __tablename__ = "request_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    request_id: Mapped[int] = mapped_column(ForeignKey("requests.id"), nullable=False)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PolicyAttachment(Base):
    """Join table: policy_attachments. Port of Policy.attachments[]."""

    __tablename__ = "policy_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    policy_id: Mapped[int] = mapped_column(ForeignKey("policies.id"), nullable=False)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class QueryAttachment(Base):
    """Join table: query_attachments. Port of Query.attachments[]."""

    __tablename__ = "query_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    query_id: Mapped[int] = mapped_column(ForeignKey("queries.id"), nullable=False)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class CompletedAttachment(Base):
    """Join table: completed_attachments. Port of Completed.attachments[]."""

    __tablename__ = "completed_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    completed_id: Mapped[int] = mapped_column(ForeignKey("completed.id"), nullable=False)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SopAttachment(Base):
    """Join table: sop_attachments. Port of Sop.attachments[]."""

    __tablename__ = "sop_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    sop_id: Mapped[int] = mapped_column(ForeignKey("sops.id"), nullable=False)
    file_id: Mapped[int] = mapped_column(ForeignKey("files.id"), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
