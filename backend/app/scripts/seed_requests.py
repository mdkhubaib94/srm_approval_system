"""Seed script - creates 3 dummy requests at different workflow stages.
Adapted from src/scripts/seedRequests.js.

Run: python -m app.scripts.seed_requests

Requires seeded users (run seed_users first). Existing requests (matched by
request_id) are skipped.

The source used a placeholder `GenericDetail` document for all three seed
requests; that model was deliberately not ported (see the migration plan -
it existed only for Mongoose seed/test flexibility, and typed Postgres
tables remove the reason it existed). These seeds use real, valid detail
rows of the actual type each category needs instead:
  1. EquipmentPurchaseDetail (ADMIN_PURCHASE) - fresh, at INSTITUTION_MANAGER
  2. EquipmentPurchaseDetail (ADMIN_PURCHASE) - forwarded once, at INSTITUTION_MANAGER
  3. GeneralDetail (ADMIN_HR via "Staff Resignation") - forwarded to HR_HEAD
"""

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.files.models import RequestAttachment, StoredFile
from app.requests.details.models import EquipmentPurchaseDetail, GeneralDetail
from app.requests.models import Request, RequestActionHistory
from app.scripts._bootstrap import get_sessionmaker
from app.users.models import User


async def _placeholder_attachment(db) -> StoredFile:
    """A metadata-only row - no real bytes on disk, fine for seed data that
    is never actually downloaded."""
    stored = StoredFile(path_on_disk="seed/placeholder.pdf", original_filename="placeholder.pdf", mimetype="application/pdf", size_bytes=0)
    db.add(stored)
    await db.flush()
    return stored


async def seed() -> None:
    sessionmaker = get_sessionmaker()

    async with sessionmaker() as db:
        users = {
            row.employee_id: row
            for row in (await db.execute(select(User).where(User.employee_id.in_(["EMP001", "EMP002", "EMP003", "EMP004"])))).scalars()
        }
        requester, manager, accountant, hoi = (users.get(k) for k in ("EMP001", "EMP002", "EMP003", "EMP004"))

        if not all([requester, manager, accountant, hoi]):
            print("Required seed users not found. Run `python -m app.scripts.seed_users` first.")
            return

        created = 0
        skipped = 0

        # ── 1. Fresh request - waiting at Institution Manager ──────────────────
        if not (await db.execute(select(Request.id).where(Request.request_id == "SEED-REQ-001"))).scalar_one_or_none():
            detail = EquipmentPurchaseDetail(
                lab_name="Computer Science Lab",
                requirement_type="General",
                equipment_specifications="10 desktop computers",
                main_equipment_cost=250000,
                landed_cost_total=250000,
            )
            db.add(detail)
            await db.flush()
            attachment = await _placeholder_attachment(db)

            request = Request(
                requester_id=requester.id,
                request_id="SEED-REQ-001",
                title="Purchase of Lab Equipment",
                description="Request to purchase 10 desktop computers for the CS lab.",
                institution="EEC",
                department="Computer Science and Engineering",
                request_category="ADMIN_PURCHASE",
                details_model="EquipmentPurchaseDetail",
                details_table_id=detail.id,
                cost=250000,
                stage="INSTITUTION_MANAGER",
                status="PENDING",
            )
            db.add(request)
            await db.flush()
            db.add(RequestAttachment(request_id=request.id, file_id=attachment.id))
            db.add(RequestActionHistory(request_id=request.id, action_by_id=requester.id, action="created", comments="Request submitted for lab equipment."))
            print('  OK    SEED-REQ-001 - "Purchase of Lab Equipment" [INSTITUTION_MANAGER]')
            created += 1
        else:
            print("  SKIP  SEED-REQ-001 - already exists")
            skipped += 1

        # ── 2. Forwarded once, still at Institution Manager ─────────────────────
        if not (await db.execute(select(Request.id).where(Request.request_id == "SEED-REQ-002"))).scalar_one_or_none():
            detail = EquipmentPurchaseDetail(
                lab_name="Staff Room",
                requirement_type="General",
                equipment_specifications="Chairs and desks",
                main_equipment_cost=85000,
                landed_cost_total=85000,
            )
            db.add(detail)
            await db.flush()
            attachment = await _placeholder_attachment(db)

            request = Request(
                requester_id=requester.id,
                request_id="SEED-REQ-002",
                title="Office Furniture Replacement",
                description="Replacement of worn-out chairs and desks in staff room.",
                institution="EEC",
                department="Computer Science and Engineering",
                request_category="ADMIN_PURCHASE",
                details_model="EquipmentPurchaseDetail",
                details_table_id=detail.id,
                cost=85000,
                stage="INSTITUTION_MANAGER",
                status="PENDING",
            )
            db.add(request)
            await db.flush()
            db.add(RequestAttachment(request_id=request.id, file_id=attachment.id))
            db.add(RequestActionHistory(request_id=request.id, action_by_id=requester.id, action="created", comments="Request submitted."))
            db.add(RequestActionHistory(request_id=request.id, action_by_id=requester.id, action="forwarded", comments="Forwarding to institution manager for review."))
            print('  OK    SEED-REQ-002 - "Office Furniture Replacement" [INSTITUTION_MANAGER]')
            created += 1
        else:
            print("  SKIP  SEED-REQ-002 - already exists")
            skipped += 1

        # ── 3. HOI forwarded to HR Head (ADMIN_HR track) ─────────────────────────
        if not (await db.execute(select(Request.id).where(Request.request_id == "SEED-REQ-003"))).scalar_one_or_none():
            detail = GeneralDetail(general_category="Staff Resignation")
            db.add(detail)
            await db.flush()
            attachment = await _placeholder_attachment(db)

            request = Request(
                requester_id=requester.id,
                request_id="SEED-REQ-003",
                title="Staff Recruitment - 2 Lab Assistants",
                description="Approval needed to recruit two lab assistants for EEC.",
                institution="EEC",
                department="Computer Science and Engineering",
                request_category="ADMIN_HR",
                details_model="GeneralDetail",
                details_table_id=detail.id,
                cost=0,
                stage="HR_HEAD",
                status="PENDING",
            )
            db.add(request)
            await db.flush()
            db.add(RequestAttachment(request_id=request.id, file_id=attachment.id))
            for action_by, action, comments in [
                (requester.id, "created", "Recruitment request submitted."),
                (manager.id, "forwarded", "Verified and forwarded to accountant."),
                (accountant.id, "forwarded", "No cost, forwarding to HOI."),
                (hoi.id, "forwarded", "Forwarding to Chairman Office."),
                (hoi.id, "forwarded", "Chairman Office cleared. Forwarding to HR Head."),
            ]:
                db.add(RequestActionHistory(request_id=request.id, action_by_id=action_by, action=action, comments=comments))
            print('  OK    SEED-REQ-003 - "Staff Recruitment - 2 Lab Assistants" [HR_HEAD]')
            created += 1
        else:
            print("  SKIP  SEED-REQ-003 - already exists")
            skipped += 1

        await db.commit()

    print(f"\nDone. Created: {created}, Skipped: {skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
