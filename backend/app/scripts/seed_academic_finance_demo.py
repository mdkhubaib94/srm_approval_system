"""Seed script - one realistic, still-pending ACADEMIC_FINANCE request with a
large Materials Requirement table, waiting at the Institution Manager so it can
be walked through the whole approval flow by hand (and then used to test the
approval-proof PDF downloads).

Run: python -m app.scripts.seed_academic_finance_demo
"""

import asyncio
from datetime import date, timedelta

from sqlalchemy import select

from app.requests.details.models import GeneralDetail, IndentLineItem
from app.requests.id_generator import generate_indent_number, generate_request_id
from app.requests.models import Request, RequestActionHistory
from app.scripts._bootstrap import get_sessionmaker
from app.users.models import User

TITLE = "National Cyber Security Awareness Week 2026"
INSTITUTION = "EEC"
DEPARTMENT = "Computer Science and Engineering"

# (product id, name, description, quantity)
MATERIALS = [
    # Venue & branding
    ("BRD-001", "Flex Banner 20x10 ft", "Main stage backdrop, 280 GSM, eyelets on all corners", 2),
    ("BRD-002", "Flex Banner 10x4 ft", "Entrance and corridor banners, printed on both sides", 6),
    ("BRD-003", "Roll-up Standee", "6x2.5 ft with aluminium stand and carry bag", 10),
    ("BRD-004", "Vinyl Sticker Sheets", "A3 glossy, awareness posters and directional signage", 120),
    ("BRD-005", "Event Posters", "A2 colour print, 170 GSM art paper", 80),
    ("BRD-006", "Programme Brochures", "A5 tri-fold, 4-colour, 130 GSM", 600),
    ("BRD-007", "Participant ID Cards", "PVC card with lanyard and holder", 650),
    ("BRD-008", "Volunteer T-Shirts", "Round neck, dry-fit, printed logo, sizes M-XXL", 60),
    ("BRD-009", "Organiser Jackets", "Embroidered logo, coordinator team", 12),
    ("BRD-010", "Memento Shields", "Wooden base with acrylic plate, for guest speakers", 15),
    ("BRD-011", "Certificates", "A4 matte 250 GSM, participation and merit", 700),
    ("BRD-012", "Certificate Folders", "Padded, with embossed institution emblem", 80),
    # Audio visual
    ("AVL-001", "Wireless Handheld Microphone", "UHF, dual channel with receiver", 4),
    ("AVL-002", "Collar Microphone", "Wireless lapel mic with bodypack transmitter", 3),
    ("AVL-003", "Portable PA Speaker", "500 W active, Bluetooth, with stand", 4),
    ("AVL-004", "HDMI Cable 10 m", "High-speed, gold plated connectors", 8),
    ("AVL-005", "HDMI Splitter 1x4", "4K support, powered", 2),
    ("AVL-006", "Laser Presentation Remote", "2.4 GHz with green pointer", 6),
    ("AVL-007", "Projector Screen 8x6 ft", "Tripod stand, matte white", 2),
    ("AVL-008", "LED Par Light", "RGBW stage lighting, DMX enabled", 16),
    ("AVL-009", "Extension Board 6-socket", "16A with surge protection, 5 m cord", 20),
    ("AVL-010", "Cable Cover Ramps", "Heavy-duty floor cable protectors", 10),
    # Capture-the-flag / lab consumables
    ("LAB-001", "USB Flash Drive 32 GB", "USB 3.0, for CTF challenge distribution", 60),
    ("LAB-002", "Cat6 Patch Cable 2 m", "Network cabling for CTF lab setup", 100),
    ("LAB-003", "Network Switch 24-port", "Gigabit managed, rack mountable", 4),
    ("LAB-004", "Wireless Access Point", "Dual-band, ceiling mount, PoE", 3),
    ("LAB-005", "Raspberry Pi 4 Model B", "4 GB RAM, with case, heatsink and 5V adapter", 10),
    ("LAB-006", "microSD Card 64 GB", "Class 10 A1, pre-flashed for workshop labs", 30),
    ("LAB-007", "Ethernet Crimping Kit", "RJ45 crimper, tester and 100 connectors", 5),
    ("LAB-008", "Laptop Cooling Pad", "Dual fan, adjustable stand", 15),
    ("LAB-009", "Wireless Mouse", "2.4 GHz optical, for workshop systems", 40),
    ("LAB-010", "Headphones with Mic", "Over-ear, USB, for hackathon participants", 25),
    # Stationery
    ("STN-001", "Spiral Notebook A4", "100 pages, ruled", 700),
    ("STN-002", "Ball Point Pens", "Blue ink, box of 50", 24),
    ("STN-003", "Branded Pens", "Metal body with logo, for delegates", 700),
    ("STN-004", "Whiteboard Markers", "Assorted colours, set of 4", 60),
    ("STN-005", "Permanent Markers", "Black, bullet tip", 40),
    ("STN-006", "Sticky Notes", "3x3 inch, pack of 5 colours", 100),
    ("STN-007", "A4 Copier Paper", "75 GSM, ream of 500 sheets", 40),
    ("STN-008", "Clipboards", "Hardboard, with steel clip, A4", 50),
    ("STN-009", "Stapler with Pins", "Heavy duty, 24/6 pins", 12),
    ("STN-010", "Registration Table Cloth", "White, 6 ft", 10),
    ("STN-011", "Tent Cards", "Name tents for dais and registration", 100),
    ("STN-012", "Double-sided Tape", "48 mm, 25 m roll", 30),
    # Hospitality
    ("HSP-001", "Packaged Drinking Water 1 L", "Case of 12 bottles", 90),
    ("HSP-002", "Water Dispenser", "Hot/cold, floor standing", 4),
    ("HSP-003", "Disposable Cups", "200 ml paper cups, pack of 50", 160),
    ("HSP-004", "Tea and Coffee Flask", "5 L stainless steel, with tap", 8),
    ("HSP-005", "Snack Boxes", "Veg, with juice and fruit", 700),
    ("HSP-006", "Bouquets", "Fresh flowers, for chief guest and speakers", 15),
    ("HSP-007", "Shawls", "Silk-blend, for dignitaries", 8),
    ("HSP-008", "Garlands", "Rose and marigold", 12),
    ("HSP-009", "Lamp Set", "Brass traditional lamp for inauguration", 1),
    # Safety & housekeeping
    ("SAF-001", "First Aid Kit", "Wall mount, 100-piece", 4),
    ("SAF-002", "Fire Extinguisher 4 kg", "ABC dry powder, for event halls", 6),
    ("SAF-003", "Crowd Control Barricades", "Stainless steel, 2 m", 20),
    ("SAF-004", "Signage Stand", "Folding A-frame, directions and warnings", 10),
    ("SAF-005", "Disposable Face Masks", "3-ply, box of 50", 20),
    ("SAF-006", "Hand Sanitiser 500 ml", "70% alcohol, pump bottle", 40),
    ("SAF-007", "Garbage Bags", "Large, 30 x 40 inch, pack of 30", 40),
    ("SAF-008", "Walkie-Talkie Set", "UHF, 5 km range, with chargers", 8),
    # Prizes
    ("PRZ-001", "Winner Trophy", "Gold-plated cup, 12 inch with engraved plate", 6),
    ("PRZ-002", "Runner-up Trophy", "Silver-plated cup, 10 inch with engraved plate", 6),
    ("PRZ-003", "Medal Set", "Gold, silver and bronze with ribbon", 60),
    ("PRZ-004", "Gift Vouchers", "Rs. 2,000 e-commerce vouchers for winners", 12),
    ("PRZ-005", "Prize Hampers", "Branded backpack, water bottle and diary", 30),
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    async with sessionmaker() as db:
        existing = (
            await db.execute(select(Request.id).where(Request.title == TITLE, Request.institution == INSTITUTION))
        ).scalar_one_or_none()
        if existing:
            print(f"SKIP  {TITLE} already exists")
            return

        requester = (await db.execute(select(User).where(User.email == "requester@gmail.com"))).scalar_one_or_none()
        if requester is None:
            print("requester@gmail.com not found. Run `python -m app.scripts.seed_users` first.")
            return

        start = date.today() + timedelta(days=21)
        detail = GeneralDetail(
            general_category="Awareness Programme",
            event_name=TITLE,
            target_dates_from=start,
            target_dates_to=start + timedelta(days=4),
            target_dates_total_days=5,
            indent_number=generate_indent_number(INSTITUTION, DEPARTMENT),
        )
        db.add(detail)
        await db.flush()

        for i, (pid, name, desc, qty) in enumerate(MATERIALS, start=1):
            db.add(
                IndentLineItem(
                    owner_table="general_details",
                    owner_id=detail.id,
                    serial_number=i,
                    product_id=pid,
                    product_name=name,
                    product_description=desc,
                    quantity=qty,
                )
            )

        request = Request(
            requester_id=requester.id,
            request_id=await generate_request_id(db, INSTITUTION, DEPARTMENT),
            title=TITLE,
            description=(
                "Five-day awareness programme for 650 students and faculty covering phishing, ransomware, "
                "secure coding and digital hygiene, with expert talks, hands-on labs, a capture-the-flag "
                "contest and a closing prize ceremony. Materials listed below cover branding, audio-visual, "
                "lab consumables, stationery, hospitality, safety and prizes."
            ),
            institution=INSTITUTION,
            department=DEPARTMENT,
            request_category="ACADEMIC_FINANCE",
            details_model="GeneralDetail",
            details_table_id=detail.id,
            cost=585000,
            stage="INSTITUTION_MANAGER",
            status="PENDING",
        )
        db.add(request)
        await db.flush()
        db.add(
            RequestActionHistory(
                request_id=request.id,
                action_by_id=requester.id,
                action="created",
                comments="Request submitted with full materials requirement for the event.",
            )
        )
        await db.commit()
        print(f"OK    {request.request_id} - {TITLE}")
        print(
            f"      ACADEMIC_FINANCE, pending at INSTITUTION_MANAGER, "
            f"{len(MATERIALS)} materials, indent {detail.indent_number}"
        )


if __name__ == "__main__":
    asyncio.run(seed())
