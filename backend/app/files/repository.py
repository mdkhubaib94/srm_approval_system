"""Raw persistence operations for the Files domain (StoredFile + the
request-attachment join used directly by the upload endpoints). The other
per-owner attachment join tables (policy/query/completed/sop attachments)
are written by their own domain's repository, even though the ORM classes
physically live in app/files/models.py."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.files.models import RequestAttachment, StoredFile


async def list_attachment_files(db: AsyncSession, join_model, where_clause) -> list[dict]:
    """Every owning entity (request/policy/query/completed/sop) exposes its
    attachments the same shape: [{file_id, filename, mimetype, uploaded_at}].
    Every *Attachment join table has the same (id, <owner>_id, file_id,
    uploaded_at) shape, so this one query covers all of them — each domain's
    own repository just supplies its join model and WHERE clause."""
    stmt = (
        select(StoredFile, join_model.uploaded_at)
        .join(join_model, join_model.file_id == StoredFile.id)
        .where(where_clause)
        .order_by(join_model.uploaded_at)
    )
    rows = (await db.execute(stmt)).all()
    return [
        {"file_id": f.id, "filename": f.original_filename, "mimetype": f.mimetype, "uploaded_at": uploaded_at}
        for f, uploaded_at in rows
    ]


def add_stored_file(db: AsyncSession, stored_file: StoredFile) -> None:
    db.add(stored_file)


async def get_stored_file_by_id(db: AsyncSession, file_id: int) -> StoredFile | None:
    return await db.get(StoredFile, file_id)


async def flush(db: AsyncSession) -> None:
    await db.flush()


async def commit(db: AsyncSession) -> None:
    await db.commit()


def add_request_attachment(db: AsyncSession, *, request_id: int, file_id: int) -> None:
    db.add(RequestAttachment(request_id=request_id, file_id=file_id))
