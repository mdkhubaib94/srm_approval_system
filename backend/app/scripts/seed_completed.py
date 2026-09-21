"""Seed script - creates 4 approved requests (CHAIRMAN/APPROVED) and their
Completed records in varied states (completed, overdue, on-track, future).
Adapted from src/scripts/seedCompleted.js (GenericDetail replaced with real
EquipmentPurchaseDetail rows - see seed_requests.py for why).

Run: python -m app.scripts.seed_completed
"""

import asyncio
from datetime import date, timedelta

from sqlalchemy import select

from app.completed.models import Completed
from app.files.models import RequestAttachment, StoredFile
from app.requests.details.models import EquipmentPurchaseDetail
from app.requests.models import Request, RequestActionHistory
from app.scripts._bootstrap import get_sessionmaker
from app.users.models import User

APPROVED_REQUESTS = [
    {"request_id": "APPROVED-001", "title": "New Laboratory Equipment Purchase", "description": "Purchase of advanced microscopes and testing equipment for research lab.", "cost": 500000},
    {"request_id": "APPROVED-002", "title": "Faculty Development Program", "description": "Funding for 5 faculty members to attend international conference.", "cost": 300000},
    {"request_id": "APPROVED-003", "title": "Library Book Procurement", "description": "Purchase of 200 technical books for department library.", "cost": 150000},
    {"request_id": "APPROVED-004", "title": "Software License Renewal", "description": "Annual renewal of MATLAB and AutoCAD licenses for 100 users.", "cost": 250000},
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    today = date.today()

    async with sessionmaker() as db:
        requester = (await db.execute(select(User).where(User.employee_id == "EMP001"))).scalar_one_or_none()
        chairman = (await db.execute(select(User).where(User.employee_id == "EMP011"))).scalar_one_or_none()

        if not requester or not chairman:
            print("Required seed users not found. Run `python -m app.scripts.seed_users` first.")
            return

        print("\n=== Creating Approved Requests ===")
        created_requests: list[Request] = []
        requests_created = requests_skipped = 0

        for data in APPROVED_REQUESTS:
            existing = (await db.execute(select(Request).where(Request.request_id == data["request_id"]))).scalar_one_or_none()
            if existing is not None:
                print(f"  SKIP  {data['request_id']} - already exists")
                requests_skipped += 1
                created_requests.append(existing)
                continue

            detail = EquipmentPurchaseDetail(
                lab_name="Research Lab", requirement_type="General", equipment_specifications=data["title"], main_equipment_cost=data["cost"], landed_cost_total=data["cost"]
            )
            db.add(detail)
            await db.flush()

            stored = StoredFile(path_on_disk="seed/placeholder.pdf", original_filename="placeholder.pdf", mimetype="application/pdf", size_bytes=0)
            db.add(stored)
            await db.flush()

            request = Request(
                requester_id=requester.id,
                request_id=data["request_id"],
                title=data["title"],
                description=data["description"],
                institution="EEC",
                department="Computer Science and Engineering",
                request_category="ADMIN_PURCHASE",
                details_model="EquipmentPurchaseDetail",
                details_table_id=detail.id,
                cost=data["cost"],
                stage="CHAIRMAN",
                status="APPROVED",
            )
            db.add(request)
            await db.flush()
            db.add(RequestAttachment(request_id=request.id, file_id=stored.id))
            db.add(RequestActionHistory(request_id=request.id, action_by_id=requester.id, action="created", comments=f"{data['title']} submitted."))
            db.add(RequestActionHistory(request_id=request.id, action_by_id=chairman.id, action="approved", comments="Approved by Chairman."))
            print(f"  OK    {data['request_id']} - \"{data['title']}\" [APPROVED]")
            requests_created += 1
            created_requests.append(request)

        await db.flush()

        print("\n=== Creating Completion Records ===")
        completion_specs = [
            {"expected_completion": today - timedelta(days=7), "completion_date": today - timedelta(days=1), "completed_status": True},
            {"expected_completion": today - timedelta(days=7), "completed_status": False, "reason_for_pending": "Waiting for vendor confirmation and delivery schedule."},
            {"expected_completion": today + timedelta(days=7), "completed_status": False, "reason_for_pending": "Books ordered, awaiting shipment from publisher."},
            {"expected_completion": today + timedelta(days=30), "completed_status": False},
        ]

        completed_created = completed_skipped = 0
        for request, spec in zip(created_requests, completion_specs):
            existing = (await db.execute(select(Completed.id).where(Completed.request_id == request.id))).scalar_one_or_none()
            if existing is not None:
                print(f"  SKIP  Completion for {request.request_id} - already exists")
                completed_skipped += 1
                continue

            db.add(Completed(request_id=request.id, **spec))
            status_label = "COMPLETED" if spec.get("completed_status") else ("OVERDUE" if spec["expected_completion"] < today else "PENDING")
            print(f"  OK    Completion for {request.request_id} - [{status_label}]")
            completed_created += 1

        await db.commit()

    print("\n=== Summary ===")
    print(f"Requests - Created: {requests_created}, Skipped: {requests_skipped}")
    print(f"Completed - Created: {completed_created}, Skipped: {completed_skipped}")


if __name__ == "__main__":
    asyncio.run(seed())
