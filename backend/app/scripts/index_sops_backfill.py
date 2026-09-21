"""One-time backfill: index the documents of ALL existing SOPs. Direct port
of src/scripts/indexSops.js.

Usage:
  python -m app.scripts.index_sops_backfill            # index everything not yet done
  python -m app.scripts.index_sops_backfill --all      # force re-index everything

Runs sequentially (one SOP at a time). Scanned PDFs go through OCR and can
take a few minutes each - that's expected.
"""

import argparse
import asyncio

from sqlalchemy import or_, select

from app.scripts._bootstrap import get_sessionmaker
from app.sops.embedding_service import warm_up_embeddings
from app.sops.index_service import index_sop_document
from app.sops.models import Sop


async def run(force_all: bool) -> None:
    warm_up_embeddings()

    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        stmt = select(Sop.id, Sop.reference_number).where(Sop.is_active.is_(True))
        if not force_all:
            stmt = stmt.where(Sop.doc_index_status.in_(["pending", "failed", "no_document"]))
        sops = (await db.execute(stmt)).all()

    print(f"Found {len(sops)} SOP(s) to index{' (forced)' if force_all else ''}\n")

    done = failed = 0
    for i, (sop_id, reference_number) in enumerate(sops, start=1):
        print(f"[{i}/{len(sops)}] {reference_number}")
        await index_sop_document(sop_id)

        async with sessionmaker() as db:
            refreshed = await db.get(Sop, sop_id)
        if refreshed and refreshed.doc_index_status == "done":
            done += 1
        else:
            failed += 1
            print(f"  -> {refreshed.doc_index_status if refreshed else 'missing'}: {refreshed.doc_index_error if refreshed else ''}")

    print(f"\nFinished. Indexed: {done}, failed/skipped: {failed}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--all", action="store_true", help="Force re-index every active SOP, not just pending/failed ones.")
    args = parser.parse_args()
    asyncio.run(run(args.all))


if __name__ == "__main__":
    main()
