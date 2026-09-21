"""Seed script - ensures every known role -> permission grant (see
app.permissions.service.PERMISSION_LABELS) has a default row set.

Run: python -m app.scripts.seed_role_permissions

This is normally unnecessary: migration e2a4c9d17b3f already creates the
role_permissions table and seeds "download_attachments" as granted for every
role. This script exists as a safety net for an on-prem deploy where that
step needs to be (re)applied by hand — e.g. the table was created without
running the full migration, or a future permission key is added to
PERMISSION_LABELS after this deploy's migrations already ran.

Idempotent and non-destructive: a permission key is seeded (every role
granted) ONLY if it currently has zero rows — i.e. it has never been
configured. A key an admin has already customized via the "Manage
permissions" UI (even to a narrower set of roles) is left untouched, since
under this data model "no row for a role" means "not granted", not "unset".
"""

import asyncio

from app.core.rbac import ROLES
from app.permissions import repository as repo
from app.permissions.service import PERMISSION_LABELS
from app.scripts._bootstrap import get_sessionmaker


async def seed() -> None:
    sessionmaker = get_sessionmaker()

    seeded = 0
    skipped = 0

    async with sessionmaker() as db:
        for key, label in PERMISSION_LABELS.items():
            existing = await repo.get_roles_for_key(db, key)
            if existing:
                print(f"  SKIP  {key:<24} ({label}) - already configured, {len(existing)} role(s) granted")
                skipped += 1
                continue

            await repo.replace_roles_for_key(db, key, list(ROLES))
            print(f"  OK    {key:<24} ({label}) - granted to all {len(ROLES)} roles")
            seeded += 1

    print(f"\nDone. Seeded: {seeded}, Skipped (already configured): {skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
