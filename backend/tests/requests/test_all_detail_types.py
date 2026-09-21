"""Parametrized create+view+forward round-trip, one case per production
detail type (all 14) — Phase 3 coverage per the migration plan."""

import json

import pytest

from app.requests.workflow import DETAILS_MODEL_CATEGORY, GENERAL_CATEGORY_CATEGORY, derive_request_category
from tests.factories import make_user

from .conftest import pdf_upload

# One minimal-but-valid payload per detail type, keyed by details_model name.
DETAIL_PAYLOADS: dict[str, dict] = {
    "MouDetail": {
        "legal_opinion_obtained": True,
        "mou_type": "Fresh",
        "organisation_name": "Acme Labs",
        "organisation_type": "Software",
        "domain_or_products": "Cloud tooling",
        "validity_from": "2025-01-01",
        "validity_to": "2026-01-01",
    },
    "GuestLectureDetail": {
        "coordinator_name": "Dr. Rao",
        "coordinator_phone": "9999999999",
        "programme_title": "AI in Industry",
        "target_audience": "Students",
        "mode": "Physical",
        "mapped_course_semester": "CSE Sem 5",
        "expected_participants": 100,
        "schedule_date": "2025-03-01",
        "schedule_time": "10:00",
        "schedule_duration": "2 hours",
        "criteria_aligned": "Criteria 1.3",
        "speaker_category": "Industry Expert",
        "iqac_target_for_year": 10,
        "iqac_conducted_so_far": 3,
        "speaker_profile_attached": True,
    },
    "EquipmentPurchaseDetail": {
        "lab_name": "Robotics Lab",
        "requirement_type": "General",
        "equipment_specifications": "3D printer",
        "main_equipment_cost": 50000,
        "landed_cost_total": 55000,
    },
    "MaintenanceDetail": {
        "location": "Block A",
        "maintenance_type": "Electrical",
        "category": "Old",
    },
    "SeminarParticipationDetail": {
        "staff_qualification": "PhD",
        "title_of_programme": "ICML 2025",
        "duration_from": "2025-06-01",
        "duration_to": "2025-06-05",
        "hosting_institution_address": "MIT, USA",
        "programme_scale": "International",
        "nature_of_participation": "Paper Presentation",
        "expenses_india_total": 20000,
    },
    "SeminarHostingDetail": {
        "subject": "National Symposium on Robotics",
        "coordinator_name": "Dr. Iyer",
        "coordinator_phone": "8888888888",
        "programme_scale": "National",
        "duration_days": 2,
        "schedule_from": "2025-07-01",
        "target_audience": "Student",
        "association_head": "Dr. Sharma",
        "management_subsidy_requested": 15000,
    },
    "MachineRepairDetail": {
        "subject": "Lathe machine breakdown",
        "machine_name": "Lathe X200",
        "machine_no": "LX-200-01",
        "brand": "Acme",
        "machine_incharge": "Mr. Kumar",
        "nature_of_problem": "Motor failure",
        "not_working_since": "2025-01-01",
        "reported_on": "2025-01-02",
        "reported_to_whom": "Lab Supervisor",
        "current_repair_estimate": 5000,
        "estimated_rectification_days": 3,
    },
    "GeneralDetail": {
        "general_category": "Medical Leave",
    },
    "DiscontinuedStudentDetail": {
        "student_name": "John Doe",
        "register_number": "REG12345",
        "course_and_branch": "B.Tech CSE",
        "study_mode": "Regular",
        "admission_category": "Government Quota",
        "date_of_admission": "2022-07-01",
        "current_semester": 5,
        "current_year": 3,
        "father_name": "Richard Doe",
        "mother_name": "Jane Doe",
        "last_date_of_class_attended": "2024-12-01",
        "number_of_days_attended": 10,
        "attendance_percentage": 40,
        "reason_for_discontinuation": "Family reasons",
        "remaining_fees_to_be_collected": False,
        "tc_issuance_authorized": True,
    },
    "FeesConcessionDetail": {
        "student_name": "Jane Roe",
        "registration_no": "REG54321",
        "year_of_admission": 2022,
        "course_branch_year": "B.Tech ECE, 3rd year",
        "sports_quota_type": "State Level",
        "initial_admission_concession_percentage": 25,
        "attitude_and_behaviour": "Good",
        "total_cgpa": 8.2,
    },
    "NonBudgetedAssetDetail": {
        "incharge_name": "Dr. Verma",
        "incharge_designation": "HOD",
        "asset_specifications": "Server rack",
        "utilization_category": "General Utilization",
        "justification": "Needed for research lab",
        "main_equipment_cost": 100000,
        "landed_cost": 110000,
        "reason_not_in_current_budget": "Emerged after budget approval",
    },
    "UnexpectedExpenseDetail": {
        "incharge_name_designation": "Dr. Nair, HOD",
        "expense_category": "Renovation",
        "particulars": "Emergency roof repair",
    },
    "ITPurchaseDetail": {
        "lab_name": "Computer Lab 2",
        "requirement_type": "Mandatory Requirement",
        "equipment_specifications": "20 desktops",
        "main_equipment_cost": 800000,
        "landed_cost_total": 850000,
    },
    "RecurringExpenditureDetail": {
        "frequency": "Monthly",
    },
}


async def _login(client, email, password="secret123"):
    resp = await client.post("/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200, resp.text
    return resp.json()["accessToken"]


@pytest.mark.parametrize("details_model", sorted(DETAIL_PAYLOADS.keys()))
async def test_create_view_and_forward_round_trip(client, db_session, details_model):
    email = f"req.{details_model.lower()}@example.com"
    await make_user(db_session, employee_id=f"DT-{details_model}", email=email, role="REQUESTER", institution="EEC", department="Physics")
    token = await _login(client, email)

    create_resp = await client.post(
        "/requests",
        data={
            "title": f"Test request for {details_model}",
            "department": "Physics",
            "details_model": details_model,
            "details_payload": json.dumps(DETAIL_PAYLOADS[details_model]),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    created = create_resp.json()
    assert created["detailsModel"] == details_model
    assert created["stage"] == "INSTITUTION_MANAGER"
    assert created["status"] == "PENDING"

    expected_category = derive_request_category(details_model, DETAIL_PAYLOADS[details_model].get("general_category"))
    assert created["requestCategory"] == expected_category

    request_id = created["requestID"]
    get_resp = await client.get(f"/requests/{request_id}", headers={"Authorization": f"Bearer {token}"})
    assert get_resp.status_code == 200
    assert get_resp.json()["detailsModel"] == details_model


def test_derive_request_category_covers_every_details_model_mapping():
    for details_model, expected_category in DETAILS_MODEL_CATEGORY.items():
        if details_model == "GeneralDetail":
            continue
        assert derive_request_category(details_model) == expected_category


def test_derive_request_category_covers_every_general_category_mapping():
    for general_category, expected_category in GENERAL_CATEGORY_CATEGORY.items():
        assert derive_request_category("GeneralDetail", general_category) == expected_category


def test_derive_request_category_rejects_unknown_inputs():
    assert derive_request_category("NotARealDetailType") is None
    assert derive_request_category("GeneralDetail", "Not a real category") is None
    assert derive_request_category("GeneralDetail", None) is None


@pytest.mark.parametrize("details_model", ["GeneralDetail", "NonBudgetedAssetDetail", "UnexpectedExpenseDetail", "ITPurchaseDetail", "RecurringExpenditureDetail"])
async def test_indent_wiring_generalizes_to_every_newly_added_indent_capable_type(client, db_session, details_model):
    """The indent line-item/owner_table dispatch was proven generically for
    EquipmentPurchaseDetail in Phase 2 — this confirms it actually generalizes
    to the 5 indent-capable types added in Phase 3, not just structurally."""
    email = f"req.indent.{details_model.lower()}@example.com"
    await make_user(db_session, employee_id=f"IND-{details_model}", email=email, role="REQUESTER", institution="EEC", department="Physics")
    token = await _login(client, email)

    payload = {**DETAIL_PAYLOADS[details_model], "indent_details": [{"product_id": "P1", "product_name": "Widget", "quantity": 4}]}

    create_resp = await client.post(
        "/requests",
        data={
            "title": f"Indent smoke test for {details_model}",
            "department": "Physics",
            "details_model": details_model,
            "details_payload": json.dumps(payload),
        },
        files=[pdf_upload()],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert create_resp.status_code == 201, create_resp.text
    details = create_resp.json()["details"]
    assert details["indentNumber"]
    assert len(details["indentDetails"]) == 1
    assert details["indentDetails"][0]["productName"] == "Widget"
    assert details["indentDetails"][0]["quantity"] == 4
