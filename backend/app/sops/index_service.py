"""Background SOP document indexing. Direct port of
src/services/sopIndexService.js.

SOP creation stays instant: the router enqueues the SOP id here and responds
immediately. This then (one SOP at a time, bounded memory):
  1. reads the SOP's PDF off local disk
  2. extracts text (text layer, or OCR for scanned PDFs — can take 5-20s per
     page, which is exactly why this never runs inside a request handler)
  3. cleans boilerplate + chunks the text
  4. embeds every chunk locally and saves them on the Sop row

A periodic sweep retries anything left "pending"/"processing" (e.g. after a
process restart killed a job mid-flight), or embedded with a stale
embedding_model (auto-migration path if EMBEDDING_MODEL changes). "failed"
SOPs are NOT auto-retried — they need a manual re-index to avoid infinite
failure loops.
"""

import asyncio
import logging
from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.db.base import get_sessionmaker
from app.db.helpers import get_with_options
from app.files.models import SopAttachment, StoredFile
from app.files.storage import read_bytes

from .embedding_service import generate_embedding
from app.sops.models import Sop, SopChunk
from .pdf_text_service import pdf_to_chunks

logger = logging.getLogger("app.sops.index")

# ─── Sequential in-process queue ──────────────────────────────────────────────

_queue: list[int] = []
_processing = False


def enqueue_sop_indexing(sop_id: int) -> None:
    if sop_id not in _queue:
        _queue.append(sop_id)
    asyncio.create_task(_process_queue())  # fire and forget


async def _process_queue() -> None:
    global _processing
    if _processing:
        return
    _processing = True
    try:
        while _queue:
            sop_id = _queue.pop(0)
            try:
                await index_sop_document(sop_id)
            except Exception:
                # index_sop_document records failures itself; this is a backstop.
                logger.exception("[sopIndex] Unhandled error indexing SOP %s", sop_id)
    finally:
        _processing = False


# ─── The actual indexing job ──────────────────────────────────────────────────


async def index_sop_document(sop_id: int, db: AsyncSession | None = None) -> None:
    """Runs the indexing pipeline for one SOP.

    `db` is normally omitted — the real background-queue path
    (_process_queue) always opens its own session, since it runs outside any
    HTTP request's session lifecycle. Tests pass their own transactional
    session explicitly so the job can see (and roll back) data created
    earlier in the same test — a session opened fresh via
    get_sessionmaker() would use a new DB connection and never see another
    session's uncommitted work.
    """
    if db is not None:
        await _run_indexing(sop_id, db)
        return

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as session:
        await _run_indexing(sop_id, session)


async def _run_indexing(sop_id: int, db: AsyncSession) -> None:
    from .search_service import invalidate_sop_cache

    sop = await get_with_options(db, Sop, sop_id, selectinload(Sop.chunks))
    if sop is None:
        return

    async def refresh_description_embedding() -> None:
        # Always (re)generate the description embedding here too — this is
        # what makes switching EMBEDDING_MODEL a clean migration: one
        # re-index pass moves every stored vector into the new model's space.
        sop.description_embedding = generate_embedding(f"{sop.title}. {sop.description}")
        sop.embedding_model = get_settings().embedding_model

    attachment = (
        await db.execute(select(SopAttachment).where(SopAttachment.sop_id == sop.id).limit(1))
    ).scalar_one_or_none()

    if attachment is None:
        try:
            await refresh_description_embedding()
        except Exception:
            logger.exception("[sopIndex] Description embedding failed for %s", sop.reference_number)
        sop.doc_index_status = "no_document"
        await db.commit()
        invalidate_sop_cache()
        return

    sop.doc_index_status = "processing"
    sop.doc_index_error = None
    await db.commit()

    started_at = datetime.now(timezone.utc)
    logger.info("[sopIndex] Indexing SOP %s...", sop.reference_number)

    try:
        file_row = await db.get(StoredFile, attachment.file_id)
        pdf_bytes = read_bytes(file_row.path_on_disk)

        def on_progress(page: int) -> None:
            logger.info("[sopIndex]   OCR page %d of %s...", page, sop.reference_number)

        chunks, extraction_method = pdf_to_chunks(pdf_bytes, on_progress)

        if not chunks:
            raise ValueError("No usable text found in the document (extraction returned empty after cleaning)")

        # Embed each chunk sequentially (bounded memory, single model instance).
        for chunk in sop.chunks:
            await db.delete(chunk)
        await db.flush()

        for chunk in chunks:
            embedding = generate_embedding(chunk["text"])
            db.add(SopChunk(sop_id=sop.id, text=chunk["text"], embedding=embedding, page=chunk["page"], source="document"))

        await refresh_description_embedding()

        sop.extraction_method = extraction_method
        sop.doc_index_status = "done"
        sop.doc_indexed_at = datetime.now(timezone.utc)
        await db.commit()
        invalidate_sop_cache()

        elapsed = (datetime.now(timezone.utc) - started_at).total_seconds()
        logger.info(
            "[sopIndex] Done: %s - %d chunks via %s in %.1fs",
            sop.reference_number,
            len(chunks),
            extraction_method,
            elapsed,
        )
    except Exception as err:
        logger.exception("[sopIndex] Failed for SOP %s", sop.reference_number)
        try:
            await db.rollback()
            sop = await db.get(Sop, sop_id)
            sop.doc_index_status = "failed"
            sop.doc_index_error = str(err)[:500]
            await db.commit()
            invalidate_sop_cache()
        except Exception:
            logger.exception("[sopIndex] Could not record failure state")


# ─── Sweeps ───────────────────────────────────────────────────────────────────


async def sweep_pending_sops() -> None:
    """Re-enqueue SOPs that need (re)indexing: stuck in pending/processing,
    or embedded with a different model than the one currently configured."""
    try:
        sessionmaker = get_sessionmaker()
        embedding_model = get_settings().embedding_model
        async with sessionmaker() as db:
            stuck = (
                await db.execute(
                    select(Sop.id, Sop.embedding_model).where(
                        Sop.is_active.is_(True),
                        or_(
                            Sop.doc_index_status.in_(["pending", "processing"]),
                            (Sop.doc_index_status != "failed") & (Sop.embedding_model != embedding_model),
                        ),
                    )
                )
            ).all()
        if stuck:
            migrating = sum(1 for _, model in stuck if model != embedding_model)
            logger.info(
                "[sopIndex] Sweep found %d SOP(s) awaiting indexing%s",
                len(stuck),
                f" ({migrating} migrating to {embedding_model})" if migrating else "",
            )
            for sop_id, _ in stuck:
                enqueue_sop_indexing(sop_id)
    except Exception:
        logger.exception("[sopIndex] Sweep failed")
