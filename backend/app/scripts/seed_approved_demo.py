"""Seed script - one fully approved request (with materials and a complete
approval trail ending at the Chairman) owned by requester@gmail.com at EEC, so
the requester and institution.manager@gmail.com can test the approval-proof
PDF downloads.

Run: python -m app.scripts.seed_approved_demo
"""

import asyncio
from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.requests.details.models import EquipmentPurchaseDetail, IndentLineItem
from app.requests.models import Request, RequestActionHistory
from app.scripts._bootstrap import get_sessionmaker
from app.users.models import User

REQUEST_ID = "APPROVED-DEMO-001"

# (employee_id, action, comment) in approval order.
TRAIL = [
    ("EMP001", "created", "Lab equipment request submitted."),
    ("EMP002", "forwarded", "Verified requirement and quantities."),
    ("EMP003", "forwarded", "Budget verified and available."),
    ("EMP004", "forwarded", "Recommended for approval."),
    ("EMP011", "approved", "Approved by Chairman."),
]

MATERIALS = [
    ("MIC-001", "Digital Microscope", "40x-1000x trinocular, LED illumination", 2),
    ("OSC-210", "Oscilloscope", "100 MHz, 4-channel digital storage", 3),
    ("PSU-050", "Bench Power Supply", "0-30V / 0-5A programmable", 5),
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        if (await db.execute(select(Request.id).where(Request.request_id == REQUEST_ID))).scalar_one_or_none():
            print(f"SKIP  {REQUEST_ID} already exists")
            return

        users = {u.employee_id: u for u in (await db.execute(select(User))).scalars()}
        missing = [e for e, _, _ in TRAIL if e not in users]
        if missing:
            print(f"Missing seed users {missing}. Run `python -m app.scripts.seed_users` first.")
            return

        detail = EquipmentPurchaseDetail(
            lab_name="Electronics Lab",
            requirement_type="General",
            equipment_specifications="Microscopes, oscilloscopes and bench power supplies",
            main_equipment_cost=450000,
            landed_cost_total=450000,
            indent_number="IND-DEMO-001",
        )
        db.add(detail)
        await db.flush()

        for i, (pid, name, desc, qty) in enumerate(MATERIALS, start=1):
            db.add(
                IndentLineItem(
                    owner_table="equipment_purchase_details",
                    owner_id=detail.id,
                    serial_number=i,
                    product_id=pid,
                    product_name=name,
                    product_description=desc,
                    quantity=qty,
                )
            )

        request = Request(
            requester_id=users["EMP001"].id,
            request_id=REQUEST_ID,
            title="Electronics Lab Equipment Purchase",
            description="Purchase of microscopes, oscilloscopes and power supplies for the electronics lab.",
            institution="EEC",
            department="Computer Science and Engineering",
            request_category="ADMIN_PURCHASE",
            details_model="EquipmentPurchaseDetail",
            details_table_id=detail.id,
            cost=450000,
            stage="CHAIRMAN",
            status="APPROVED",
        )
        db.add(request)
        await db.flush()

        start = datetime.now(timezone.utc) - timedelta(days=5)
        for i, (emp, action, comment) in enumerate(TRAIL):
            db.add(
                RequestActionHistory(
                    request_id=request.id,
                    action_by_id=users[emp].id,
                    action=action,
                    comments=comment,
                    created_at=start + timedelta(days=i, hours=i),
                )
            )

        await db.commit()
        print(f"OK    {REQUEST_ID} created [APPROVED] with {len(MATERIALS)} materials")


if __name__ == "__main__":
    asyncio.run(seed())
