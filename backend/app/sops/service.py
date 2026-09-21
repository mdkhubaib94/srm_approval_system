"""Business logic for SOPs. Reference: src/controllers/sopController.js."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.config import get_settings
from app.files.validation import InvalidUploadError
from app.sops import repository as repo
from app.files.service import store_uploaded_files
from app.sops.embedding_service import generate_embedding
from app.sops.index_service import enqueue_sop_indexing
from app.sops.models import Sop
from app.sops.search_service import invalidate_sop_cache

SOP_VIEW_ROLES = ("REQUESTER", "INSTITUTION_MANAGER", "CHAIRMAN_OFFICE")
SOP_ADMIN_ROLE = "CHAIRMAN_OFFICE"


class SopServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def can_view_sops(role: str) -> bool:
    return role in SOP_VIEW_ROLES


async def _serialize(db: AsyncSession, sop: Sop) -> dict:
    """Never includes description_embedding/chunks — mirrors the source's
    `select: false` fields, which the controller also always strips before
    responding."""
    return {
        "id": sop.id,
        "reference_number": sop.reference_number,
        "title": sop.title,
        "description": sop.description,
        "doc_index_status": sop.doc_index_status,
        "extraction_method": sop.extraction_method,
        "doc_index_error": sop.doc_index_error,
        "doc_indexed_at": sop.doc_indexed_at,
        "created_by": (
            {"id": sop.created_by.id, "name": sop.created_by.name, "email": sop.created_by.email}
            if sop.created_by
            else None
        ),
        "attachments": await repo.list_attachments(db, sop.id),
        "is_active": sop.is_active,
        "created_at": sop.created_at,
        "updated_at": sop.updated_at,
    }


async def list_sops(db: AsyncSession, current_user: CurrentUser) -> dict:
    if not can_view_sops(current_user.role):
        raise SopServiceError(403, "You do not have permission to view SOPs")

    sops = await repo.list_active_sops(db)

    return {
        "success": True,
        "count": len(sops),
        "data": [await _serialize(db, s) for s in sops],
        "user_role": current_user.role,
        "can_manage": current_user.role == SOP_ADMIN_ROLE,
    }


async def get_sop(db: AsyncSession, current_user: CurrentUser, sop_id: int) -> dict:
    if not can_view_sops(current_user.role):
        raise SopServiceError(403, "You do not have permission to view SOPs")

    sop = await repo.get_sop_by_id(db, sop_id)
    if sop is None:
        raise SopServiceError(404, "SOP not found")

    return {"success": True, "data": await _serialize(db, sop)}


async def create_sop(
    db: AsyncSession, current_user: CurrentUser, *, reference_number: str, title: str, description: str, files: list
) -> dict:
    if current_user.role != SOP_ADMIN_ROLE:
        raise SopServiceError(403, "Only CHAIRMAN_OFFICE can create SOPs")

    reference_number = (reference_number or "").strip()
    title = (title or "").strip()
    description = (description or "").strip()

    if not reference_number:
        raise SopServiceError(400, "SOP reference number is required")
    if not title:
        raise SopServiceError(400, "SOP title is required")
    if not description:
        raise SopServiceError(400, "SOP description is required")

    existing = await repo.get_sop_id_by_reference_number(db, reference_number)
    if existing is not None:
        raise SopServiceError(409, f'An SOP with reference number "{reference_number}" already exists')

    if not files:
        raise SopServiceError(400, "An SOP document must be attached")

    try:
        stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
    except InvalidUploadError as exc:
        raise SopServiceError(400, f"Failed to upload SOP document: {exc}") from exc

    # Generate the embedding locally (title + description gives the best
    # signal). Don't block SOP creation if this fails for any reason — the
    # SOP just won't participate in AI matching until re-indexed.
    description_embedding = None
    embedding_model = None
    try:
        description_embedding = generate_embedding(f"{title}. {description}")
        embedding_model = get_settings().embedding_model
    except Exception:
        pass

    sop = Sop(
        reference_number=reference_number,
        title=title,
        description=description,
        description_embedding=description_embedding,
        embedding_model=embedding_model,
        created_by_id=current_user.id,
    )
    repo.add_sop(db, sop)
    await repo.flush(db)

    for f in stored_files:
        repo.add_sop_attachment(db, sop_id=sop.id, file_id=f.id)

    await repo.commit(db)
    sop = await repo.get_sop_by_id(db, sop.id)

    # Kick off background document indexing (extract/OCR + chunk + embed).
    # The response is NOT delayed by this — OCR can take minutes.
    invalidate_sop_cache()
    enqueue_sop_indexing(sop.id)

    return {"success": True, "message": "SOP created successfully", "data": await _serialize(db, sop)}


async def update_sop(
    db: AsyncSession,
    current_user: CurrentUser,
    sop_id: int,
    *,
    reference_number: str | None,
    title: str | None,
    description: str | None,
    is_active: bool | None,
    files: list,
) -> dict:
    if current_user.role != SOP_ADMIN_ROLE:
        raise SopServiceError(403, "Only CHAIRMAN_OFFICE can update SOPs")

    sop = await repo.get_sop_by_id(db, sop_id)
    if sop is None:
        raise SopServiceError(404, "SOP not found")

    if reference_number is not None and reference_number.strip():
        candidate = reference_number.strip()
        duplicate = await repo.get_sop_id_by_reference_number(db, candidate, exclude_id=sop.id)
        if duplicate is not None:
            raise SopServiceError(409, f'An SOP with reference number "{candidate}" already exists')
        sop.reference_number = candidate

    text_changed = (title is not None and title.strip() and title.strip() != sop.title) or (
        description is not None and description != sop.description
    )

    if title is not None and title.strip():
        sop.title = title.strip()
    if description is not None and description.strip():
        sop.description = description
    if is_active is not None:
        sop.is_active = is_active

    document_replaced = False
    if files:
        try:
            stored_files = await store_uploaded_files(db, files, uploaded_by_id=current_user.id)
        except InvalidUploadError as exc:
            raise SopServiceError(400, f"Failed to upload SOP document: {exc}") from exc

        old_attachments = await repo.list_sop_attachments(db, sop.id)
        for old in old_attachments:
            await repo.delete_attachment(db, old)
        for f in stored_files:
            repo.add_sop_attachment(db, sop_id=sop.id, file_id=f.id)
        document_replaced = True

    if text_changed:
        try:
            sop.description_embedding = generate_embedding(f"{sop.title}. {sop.description}")
            sop.embedding_model = get_settings().embedding_model
        except Exception:
            pass

    # New document -> re-run the whole indexing pipeline in the background.
    if document_replaced:
        sop.doc_index_status = "pending"
        sop.extraction_method = None
        sop.doc_index_error = None
        for chunk in sop.chunks:
            await repo.delete_chunk(db, chunk)

    await repo.commit(db)
    sop = await repo.get_sop_by_id(db, sop_id)
    invalidate_sop_cache()

    if document_replaced:
        enqueue_sop_indexing(sop.id)

    return {"success": True, "message": "SOP updated successfully", "data": await _serialize(db, sop)}


async def delete_sop(db: AsyncSession, current_user: CurrentUser, sop_id: int) -> dict:
    if current_user.role != SOP_ADMIN_ROLE:
        raise SopServiceError(403, "Only CHAIRMAN_OFFICE can delete SOPs")

    sop = await repo.get_sop_plain(db, sop_id)
    if sop is None:
        raise SopServiceError(404, "SOP not found")

    # Soft delete so historical requests referencing this SOP stay intact.
    sop.is_active = False
    await repo.commit(db)
    invalidate_sop_cache()

    return {"success": True, "message": "SOP deleted successfully"}


async def reindex_sop(db: AsyncSession, current_user: CurrentUser, sop_id: int) -> dict:
    if current_user.role != SOP_ADMIN_ROLE:
        raise SopServiceError(403, "Only CHAIRMAN_OFFICE can re-index SOPs")

    sop = await repo.get_sop_plain(db, sop_id)
    if sop is None:
        raise SopServiceError(404, "SOP not found")
    if sop.doc_index_status == "processing":
        raise SopServiceError(409, "This SOP is already being indexed")

    sop.doc_index_status = "pending"
    sop.doc_index_error = None
    await repo.commit(db)
    enqueue_sop_indexing(sop.id)

    return {
        "success": True,
        "message": "Re-indexing started. This runs in the background and may take a few minutes for scanned documents.",
        "data": {"id": sop.id, "doc_index_status": sop.doc_index_status},
    }
