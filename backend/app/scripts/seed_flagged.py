"""Seed script - tops up pending requests to at least 10 and creates Flagged
records with randomized working hours, for exercising the Flagged UI and its
per-role visibility rules. Adapted from src/scripts/seedFlagged.js
(GenericDetail replaced with a real EquipmentPurchaseDetail row).

Run: python -m app.scripts.seed_flagged
"""

import asyncio
import random
import time
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.files.models import RequestAttachment, StoredFile
from app.flagged.models import Flagged, FlaggedUser
from app.requests.details.models import EquipmentPurchaseDetail
from app.requests.models import Request, RequestActionHistory
from app.scripts._bootstrap import get_sessionmaker
from app.tasks.sla_worker import find_responsible_users
from app.users.models import User

STAGES = [
    "INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION", "CHAIRMAN_OFFICE", "MMA",
    "AUDIT", "DEAN_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN",
]
INSTITUTIONS = ["SRMIST - E&T", "EEC", "DENTAL"]
DEPARTMENTS = ["Computer Science and Engineering", "Mechanical Engineering", "Electrical and Electronics Engineering", "Civil Engineering", "Information Technology"]
TITLES = [
    "Purchase of Lab Equipment", "Office Furniture Replacement", "Staff Recruitment Request", "Software License Renewal",
    "Building Maintenance Work", "Research Grant Proposal", "Campus Infrastructure Upgrade", "Library Book Procurement",
    "Laboratory Equipment Calibration", "Network Equipment Purchase",
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()

    async with sessionmaker() as db:
        requester = (await db.execute(select(User).where(User.role == "REQUESTER").limit(1))).scalar_one_or_none()
        if requester is None:
            print("No requester found. Run `python -m app.scripts.seed_users` first.")
            return

        existing_pending = (await db.execute(select(Request).where(Request.status == "PENDING"))).scalars().all()
        print(f"Found {len(existing_pending)} existing pending requests.")

        needed = max(0, 10 - len(existing_pending))
        if needed:
            print(f"Creating {needed} additional dummy requests...\n")
            for i in range(needed):
                detail = EquipmentPurchaseDetail(
                    lab_name="Seed Lab", requirement_type="General", equipment_specifications=TITLES[i % len(TITLES)],
                    main_equipment_cost=10000, landed_cost_total=10000,
                )
                db.add(detail)
                await db.flush()
                stored = StoredFile(path_on_disk="seed/placeholder.pdf", original_filename=f"document-{i + 1}.pdf", mimetype="application/pdf", size_bytes=0)
                db.add(stored)
                await db.flush()

                request = Request(
                    requester_id=requester.id,
                    request_id=f"FLAGGED-SEED-{int(time.time())}-{i}",
                    title=TITLES[i % len(TITLES)],
                    description=f"Dummy request created for flagged testing - {i + 1}",
                    institution=INSTITUTIONS[i % len(INSTITUTIONS)],
                    department=DEPARTMENTS[i % len(DEPARTMENTS)],
                    cost=random.randint(10000, 510000),
                    request_category="ADMIN_PURCHASE",
                    details_model="EquipmentPurchaseDetail",
                    details_table_id=detail.id,
                    stage=STAGES[i % len(STAGES)],
                    status="PENDING",
                )
                db.add(request)
                await db.flush()
                db.add(RequestAttachment(request_id=request.id, file_id=stored.id))
                db.add(RequestActionHistory(request_id=request.id, action_by_id=requester.id, action="created", comments="Request created for testing flagged functionality."))
                print(f"  Created request: {request.request_id} [{request.stage}]")
            await db.flush()

        requests = (await db.execute(select(Request).where(Request.status == "PENDING").limit(10))).scalars().all()
        if not requests:
            print("Failed to find or create pending requests.")
            return

        print(f"\nCreating flagged records for {len(requests)} requests...\n")
        created = skipped = 0
        now = datetime.now(timezone.utc)

        for request in requests:
            already_flagged = (await db.execute(select(Flagged.id).where(Flagged.request_id == request.id))).scalar_one_or_none()
            if already_flagged is not None:
                print(f"  SKIP {request.request_id} - already flagged")
                skipped += 1
                continue

            working_hours = 8 + random.random() * 7  # 8-15 hours
            request.working_hrs_taken = round(working_hours, 2)
            request.stage_arrived_at = now - timedelta(hours=working_hours)

            responsible_users = await find_responsible_users(db, request)
            if not responsible_users:
                print(f"  SKIP {request.request_id} - no responsible users found for stage {request.stage}")
                skipped += 1
                continue

            flag_resolved = random.random() < 0.2
            flagged = Flagged(request_id=request.id, flagged_stage=request.stage, flag_resolved=flag_resolved)
            db.add(flagged)
            await db.flush()
            for user in responsible_users:
                db.add(FlaggedUser(flagged_id=flagged.id, user_id=user.id))

            status_text = "Resolved" if flag_resolved else "Active"
            print(f"  {request.request_id:<30} Stage: {request.stage:<25} Hours: {working_hours:.1f}h  Users: {len(responsible_users)}  Status: {status_text}")
            created += 1

        await db.commit()

    print(f"\nSeed complete. Created {created} flagged records. Skipped {skipped}.")


if __name__ == "__main__":
    asyncio.run(seed())
