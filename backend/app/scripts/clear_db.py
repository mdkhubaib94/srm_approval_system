"""Danger: wipes operational data while preserving whichever tables you
name with --keep. Replaces the source's two near-duplicate scripts
(clearDbExceptUsers.js, clearDbExceptUsersAndSops.js) with one parametrized
tool.

Documents are deleted with DELETE (not DROP TABLE), so indexes and
constraints stay intact - same discipline as the source's deleteMany().
Table order is derived from SQLAlchemy's own FK-dependency graph
(children before parents), so this doesn't need a hand-maintained table
list to stay correct as new tables are added.

Local-disk files: any StoredFile row no longer referenced by a surviving
attachment join table (e.g. sop_attachments, if --keep sops) is deleted,
DB row and bytes on disk both - the equivalent of the source's GridFS
pruning step, adapted for local storage instead of one shared GridFS bucket.

Usage:
  python -m app.scripts.clear_db --keep users                  # like clearDbExceptUsers.js
  python -m app.scripts.clear_db --keep users,sops              # like clearDbExceptUsersAndSops.js
  python -m app.scripts.clear_db --keep users,sops --dry-run
"""

import argparse
import asyncio

from sqlalchemy import func, select

from app.db.base import Base
from app.files.models import (
    CompletedAttachment,
    PolicyAttachment,
    QueryAttachment,
    RequestAttachment,
    SopAttachment,
    StoredFile,
)
from app.files.storage import delete_file
from app.scripts._bootstrap import get_sessionmaker

# Each owning table's attachment join table - preserving the owner without
# also preserving its join table would clear the very rows that make its
# surviving files reachable, orphaning them. Same reason the source's
# clearDbExceptUsersAndSops.js prunes GridFS by checking `sops.attachments`
# rather than assuming keeping the `sops` collection was enough on its own.
ATTACHMENT_TABLE_FOR_OWNER = {
    "requests": RequestAttachment,
    "policies": PolicyAttachment,
    "queries": QueryAttachment,
    "completed": CompletedAttachment,
    "sops": SopAttachment,
}


async def clear_db(keep: set[str], dry_run: bool) -> None:
    keep = {"users"} | keep  # users are always preserved, matching both source scripts
    # A kept owner's attachment join table must also survive, or its files
    # become unreachable and get pruned below by mistake.
    keep = keep | {model.__tablename__ for owner, model in ATTACHMENT_TABLE_FOR_OWNER.items() if owner in keep}

    sessionmaker = get_sessionmaker()

    if dry_run:
        print("DRY RUN - nothing will be modified.\n")

    async with sessionmaker() as db:
        # Children before parents, so a real FK never blocks a delete.
        tables = [t for t in reversed(Base.metadata.sorted_tables) if t.name not in keep and t.name != StoredFile.__tablename__]

        total_docs = 0
        for table in tables:
            count = (await db.execute(select(func.count()).select_from(table))).scalar_one()
            if count == 0:
                continue
            total_docs += count
            verb = "would clear" if dry_run else "cleared"
            print(f"{verb}: {table.name} ({count} row(s))")
            if not dry_run:
                await db.execute(table.delete())

        if total_docs == 0:
            print("No operational data to clear.")

        # Prune local-disk files no longer referenced by any surviving
        # attachment join table (i.e. one whose name ended up in `keep`).
        referenced_file_ids: set[int] = set()
        for attachment_model in ATTACHMENT_TABLE_FOR_OWNER.values():
            if attachment_model.__tablename__ not in keep:
                continue  # this join table was just cleared above - no references survive from it
            ids = (await db.execute(select(attachment_model.file_id))).scalars().all()
            referenced_file_ids.update(ids)

        all_files = (await db.execute(select(StoredFile))).scalars().all()
        orphans = [f for f in all_files if f.id not in referenced_file_ids]

        print(f"\nFiles: {len(all_files)} total, keeping {len(referenced_file_ids)} referenced.")
        for f in orphans:
            verb = "would delete" if dry_run else "deleted"
            print(f"  {verb}: {f.original_filename} ({f.id})")
            if not dry_run:
                delete_file(f.path_on_disk)
                await db.delete(f)
        if not orphans:
            print("  No orphaned files.")

        if not dry_run:
            await db.commit()

        kept_counts = {}
        for name in keep:
            table = Base.metadata.tables.get(name)
            if table is not None:
                kept_counts[name] = (await db.execute(select(func.count()).select_from(table))).scalar_one()

    print(f"\nDone. Kept: {', '.join(f'{k} ({v})' for k, v in kept_counts.items())}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--keep", default="users", help="Comma-separated table names to preserve (users is always kept).")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    keep = {name.strip() for name in args.keep.split(",") if name.strip()}
    asyncio.run(clear_db(keep, args.dry_run))


if __name__ == "__main__":
    main()
