"""Polymorphic "detail" tables — one per request type, dispatched via
Request.details_model + registry.get_detail_model(). Direct port of the
Mongoose schemas in src/models/details/*.js.

All 14 production types are implemented here (Phase 2 landed MouDetail and
EquipmentPurchaseDetail as the two reference shapes; Phase 3 mechanically
transcribed the remaining 12 from the same audited field lists). Nested
Mongoose sub-objects (e.g. `financials.mainEquipmentCost`,
`schedule.date`) are flattened into prefixed columns — every field is
independently queryable/reportable, and Postgres has no reason to keep them
nested the way the source's document model did.

The shared indent block (indent_number + indentDetails[] + materialsChangeLog[]
in the source) is NOT duplicated as columns on every indent-capable table —
it lives in three shared tables below, addressed by a generic
(owner_table, owner_id) pair, the same "poor man's polymorphic FK" idiom
already used for Request.details_table_id (Postgres has no native FK against
"one of N tables").
"""

from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric
from sqlalchemy import Enum as SAEnum
from sqlalchemy import Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

# Detail tables that support the shared indent block — kept as the full,
# eventual set (only equipment_purchase_details exists as a real table so
# far) so the CHECK constraint below never needs an ALTER once Phase 3 adds
# the rest.
INDENT_OWNER_TABLES = (
    "equipment_purchase_details",
    "non_budgeted_asset_details",
    "it_purchase_details",
    "general_details",
    "unexpected_expense_details",
    "recurring_expenditure_details",
)


class MouDetail(Base):
    __tablename__ = "mou_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    legal_opinion_obtained: Mapped[bool] = mapped_column(nullable=False)
    mou_type: Mapped[str] = mapped_column(SAEnum("Fresh", "Renewal", name="mou_type"), nullable=False)
    organisation_name: Mapped[str] = mapped_column(String, nullable=False)
    organisation_type: Mapped[str] = mapped_column(
        SAEnum("Manufacturing", "Software", "Others", name="mou_organisation_type"), nullable=False
    )
    organisation_type_specify: Mapped[str | None] = mapped_column(String, nullable=True)
    domain_or_products: Mapped[str] = mapped_column(String, nullable=False)
    validity_from: Mapped[date] = mapped_column(Date, nullable=False)
    validity_to: Mapped[date] = mapped_column(Date, nullable=False)

    industrial_visits_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    internships_paid: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    internships_unpaid: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    placement_offers_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    has_collaborative_project: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    has_guest_lectures_conducted: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    has_sponsorships_provided: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    revenue_generated: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class EquipmentPurchaseDetail(Base):
    __tablename__ = "equipment_purchase_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lab_name: Mapped[str] = mapped_column(String, nullable=False)
    requirement_type: Mapped[str] = mapped_column(
        SAEnum(
            "As Per Curriculum", "Mandatory Requirement", "General", "Utilization",
            name="equipment_requirement_type",
        ),
        nullable=False,
    )
    justification: Mapped[str | None] = mapped_column(String, nullable=True)
    equipment_specifications: Mapped[str] = mapped_column(String, nullable=False)

    main_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False)
    ancillary_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    landed_cost_total: Mapped[float] = mapped_column(Numeric, nullable=False)
    estimated_monthly_running_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    revenue_generation_potential: Mapped[str | None] = mapped_column(String, nullable=True)

    previous_supplier_name: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_po_number: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    previous_price_paid: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    previous_life_span_expected: Mapped[str | None] = mapped_column(String, nullable=True)

    space_availability_confirmed: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    cross_dept_available: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    cross_dept_requirement_clearance: Mapped[str | None] = mapped_column(String, nullable=True)
    cross_dept_purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cross_dept_cost: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    cross_dept_utilization_pct: Mapped[float | None] = mapped_column(Numeric, nullable=True)

    # Generated once at least one indent line item exists.
    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GuestLectureDetail(Base):
    __tablename__ = "guest_lecture_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    coordinator_name: Mapped[str] = mapped_column(String, nullable=False)
    coordinator_phone: Mapped[str] = mapped_column(String, nullable=False)
    programme_title: Mapped[str] = mapped_column(String, nullable=False)
    target_audience: Mapped[str] = mapped_column(
        SAEnum("Faculty", "Students", "Both", name="guest_lecture_target_audience"), nullable=False
    )
    mode: Mapped[str] = mapped_column(SAEnum("Physical", "Online", name="guest_lecture_mode"), nullable=False)
    mapped_course_semester: Mapped[str] = mapped_column(String, nullable=False)
    professional_club_association: Mapped[str | None] = mapped_column(String, nullable=True)
    expected_participants: Mapped[int] = mapped_column(Integer, nullable=False)
    schedule_date: Mapped[date] = mapped_column(Date, nullable=False)
    schedule_time: Mapped[str] = mapped_column(String, nullable=False)
    schedule_duration: Mapped[str] = mapped_column(String, nullable=False)
    criteria_aligned: Mapped[str] = mapped_column(String, nullable=False)
    satisfies_sdg_or_iks: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    sdg_iks_details: Mapped[str | None] = mapped_column(String, nullable=True)
    speaker_category: Mapped[str] = mapped_column(
        SAEnum("Alumnus", "Industry Expert", "Entrepreneur", "Government Official", name="guest_lecture_speaker_category"),
        nullable=False,
    )
    iqac_target_for_year: Mapped[int] = mapped_column(Integer, nullable=False)
    iqac_conducted_so_far: Mapped[int] = mapped_column(Integer, nullable=False)
    running_total_received_from_management: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    speaker_profile_attached: Mapped[bool] = mapped_column(nullable=False)
    amount_sanctioned: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="2500")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MaintenanceDetail(Base):
    __tablename__ = "maintenance_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    location: Mapped[str] = mapped_column(String, nullable=False)
    maintenance_type: Mapped[str] = mapped_column(
        SAEnum("Civil", "Electrical", "Plumbing", "Carpentry", "Others", name="maintenance_type"), nullable=False
    )
    maintenance_type_specify: Mapped[str | None] = mapped_column(String, nullable=True)
    category: Mapped[str] = mapped_column(SAEnum("New", "Old", name="maintenance_category"), nullable=False)
    previous_fault_date_month: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_fault_reason: Mapped[str | None] = mapped_column(String, nullable=True)
    amount_spent_so_far: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SeminarParticipationDetail(Base):
    __tablename__ = "seminar_participation_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    staff_qualification: Mapped[str] = mapped_column(String, nullable=False)
    title_of_programme: Mapped[str] = mapped_column(String, nullable=False)
    duration_from: Mapped[date] = mapped_column(Date, nullable=False)
    duration_to: Mapped[date] = mapped_column(Date, nullable=False)
    hosting_institution_address: Mapped[str] = mapped_column(String, nullable=False)
    programme_scale: Mapped[str] = mapped_column(
        SAEnum("International", "National", "Regional", "Local", name="seminar_participation_scale"), nullable=False
    )
    nature_of_participation: Mapped[str] = mapped_column(
        SAEnum(
            "Resource Person", "Chair Person", "Paper Presentation", "Participation Only", "Workshop", "Others",
            name="seminar_participation_nature",
        ),
        nullable=False,
    )
    is_paper_referred: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    expenses_india_registration_fees: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_india_travel_allowance: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_india_stay_accommodation: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_india_total: Mapped[float] = mapped_column(Numeric, nullable=False)
    expenses_abroad_registration_fees: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_abroad_travel_allowance: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_abroad_stay_accommodation: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    expenses_abroad_other_funding_agency_arrangements: Mapped[str | None] = mapped_column(String, nullable=True)
    historical_seminar_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    historical_workshop_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    historical_conference_national_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    historical_conference_international_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    historical_paper_presentation_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class SeminarHostingDetail(Base):
    __tablename__ = "seminar_hosting_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    coordinator_name: Mapped[str] = mapped_column(String, nullable=False)
    coordinator_phone: Mapped[str] = mapped_column(String, nullable=False)
    programme_scale: Mapped[str] = mapped_column(SAEnum("National", "International", name="seminar_hosting_scale"), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False)
    schedule_from: Mapped[date] = mapped_column(Date, nullable=False)
    schedule_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_audience: Mapped[str] = mapped_column(
        SAEnum("Student", "Teachers", "Both", "Others", name="seminar_hosting_target_audience"), nullable=False
    )
    association_head: Mapped[str] = mapped_column(String, nullable=False)

    exp_posters_and_brochures: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_invitations_and_certificates: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_prizes: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_mementos: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_gifts_to_judges: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_gifts_to_chief_guest: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_gifts_to_others: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_refreshments_chief_guest: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_refreshments_participants: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_conference_kit: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_decoration: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    exp_miscellaneous: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    receipts_registration_fees: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    receipts_sponsorships: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    receipts_statutory_grants: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    receipts_other_receipts: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    management_subsidy_requested: Mapped[float] = mapped_column(Numeric, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class MachineRepairDetail(Base):
    __tablename__ = "machine_repair_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    subject: Mapped[str] = mapped_column(String, nullable=False)
    machine_name: Mapped[str] = mapped_column(String, nullable=False)
    machine_no: Mapped[str] = mapped_column(String, nullable=False)
    brand: Mapped[str] = mapped_column(String, nullable=False)
    machine_value: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    date_of_purchase: Mapped[date | None] = mapped_column(Date, nullable=True)
    installation_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    machine_incharge: Mapped[str] = mapped_column(String, nullable=False)

    nature_of_problem: Mapped[str] = mapped_column(String, nullable=False)
    not_working_since: Mapped[date] = mapped_column(Date, nullable=False)
    reported_on: Mapped[date] = mapped_column(Date, nullable=False)
    reported_to_whom: Mapped[str] = mapped_column(String, nullable=False)
    number_of_times_repaired_previously: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    amount_spent_so_far_on_repairs: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    current_repair_estimate: Mapped[float] = mapped_column(Numeric, nullable=False)

    is_under_amc: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    amc_periodicity: Mapped[str | None] = mapped_column(String, nullable=True)
    amc_company_name: Mapped[str | None] = mapped_column(String, nullable=True)
    amc_address: Mapped[str | None] = mapped_column(String, nullable=True)
    amc_contact_person: Mapped[str | None] = mapped_column(String, nullable=True)
    amc_contact_mobile: Mapped[str | None] = mapped_column(String, nullable=True)
    amc_commencement_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    amc_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    estimated_rectification_days: Mapped[int] = mapped_column(Integer, nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class GeneralDetail(Base):
    __tablename__ = "general_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    general_category: Mapped[str] = mapped_column(
        SAEnum(
            "Staff Resignation", "Maternity Leave", "Medical Leave", "On duty Leave", "No Objection Certificate",
            "Long Leave", "Refund", "Industrial Visit", "Anti ragging Event", "Camp", "Awareness Programme",
            "Yoga Event", "Others",
            name="general_category",
        ),
        nullable=False,
    )
    event_name: Mapped[str | None] = mapped_column(String, nullable=True)
    target_dates_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_dates_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    target_dates_total_days: Mapped[int | None] = mapped_column(Integer, nullable=True)

    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class DiscontinuedStudentDetail(Base):
    __tablename__ = "discontinued_student_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_name: Mapped[str] = mapped_column(String, nullable=False)
    register_number: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    course_and_branch: Mapped[str] = mapped_column(String, nullable=False)
    study_mode: Mapped[str] = mapped_column(SAEnum("Regular", "Part-time", name="discontinued_study_mode"), nullable=False)
    admission_category: Mapped[str] = mapped_column(
        SAEnum("Government Quota", "Management Quota", name="discontinued_admission_category"), nullable=False
    )
    date_of_admission: Mapped[date] = mapped_column(Date, nullable=False)
    current_semester: Mapped[int] = mapped_column(Integer, nullable=False)
    current_year: Mapped[int] = mapped_column(Integer, nullable=False)

    father_name: Mapped[str] = mapped_column(String, nullable=False)
    mother_name: Mapped[str] = mapped_column(String, nullable=False)

    last_date_of_class_attended: Mapped[date] = mapped_column(Date, nullable=False)
    number_of_days_attended: Mapped[int] = mapped_column(Integer, nullable=False)
    attendance_percentage: Mapped[float] = mapped_column(Numeric, nullable=False)
    class_coordinator_signature_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    arrear_sem1: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrear_sem2: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrear_sem3: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrear_sem4: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrear_sem5: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrear_sem6: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    reason_for_discontinuation: Mapped[str] = mapped_column(String, nullable=False)

    hostel_warden_cleared: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    librarian_cleared: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    student_counsellor_cleared: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    accounts_outstanding_balance: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    remaining_fees_to_be_collected: Mapped[bool] = mapped_column(nullable=False)
    tc_issuance_authorized: Mapped[bool] = mapped_column(nullable=False)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class FeesConcessionDetail(Base):
    __tablename__ = "fees_concession_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    student_name: Mapped[str] = mapped_column(String, nullable=False)
    registration_no: Mapped[str] = mapped_column(String, nullable=False)
    year_of_admission: Mapped[int] = mapped_column(Integer, nullable=False)
    course_branch_year: Mapped[str] = mapped_column(String, nullable=False)
    sports_quota_type: Mapped[str] = mapped_column(String, nullable=False)
    initial_admission_concession_percentage: Mapped[float] = mapped_column(Numeric, nullable=False)

    prizes_won_previous_year: Mapped[str | None] = mapped_column(String, nullable=True)
    current_year_performance_details: Mapped[str | None] = mapped_column(String, nullable=True)
    next_year_approval_details: Mapped[str | None] = mapped_column(String, nullable=True)
    attitude_and_behaviour: Mapped[str] = mapped_column(String, nullable=False)

    total_cgpa: Mapped[float] = mapped_column(Numeric, nullable=False)
    attendance_excluding_od: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    pass_percentage_cgpa: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    arrears_sem1: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrears_sem2: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrears_sem3: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrears_sem4: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrears_sem5: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    arrears_sem6: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")
    total_arrears_as_on_date: Mapped[int] = mapped_column(Integer, nullable=False, server_default="0")

    original_concession_given_by_whom: Mapped[str | None] = mapped_column(String, nullable=True)
    original_concession_referred_contact_person: Mapped[str | None] = mapped_column(String, nullable=True)
    original_concession_contact_number: Mapped[str | None] = mapped_column(String, nullable=True)

    remarks_by_hod: Mapped[str | None] = mapped_column(String, nullable=True)
    remarks_by_physical_director: Mapped[str | None] = mapped_column(String, nullable=True)
    details_of_enclosures: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class NonBudgetedAssetDetail(Base):
    __tablename__ = "non_budgeted_asset_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incharge_name: Mapped[str] = mapped_column(String, nullable=False)
    incharge_designation: Mapped[str] = mapped_column(String, nullable=False)
    asset_specifications: Mapped[str] = mapped_column(String, nullable=False)
    utilization_category: Mapped[str] = mapped_column(
        SAEnum("As per Curriculum", "Mandatory Requirement", "General Utilization", name="non_budgeted_utilization_category"),
        nullable=False,
    )
    justification: Mapped[str] = mapped_column(String, nullable=False)

    main_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False)
    ancillary_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    landed_cost: Mapped[float] = mapped_column(Numeric, nullable=False)
    monthly_running_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    reason_not_in_current_budget: Mapped[str] = mapped_column(String, nullable=False)
    revenue_generation_details: Mapped[str | None] = mapped_column(String, nullable=True)

    previous_supplier_name: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    previous_price_paid: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    previous_expected_lifespan: Mapped[str | None] = mapped_column(String, nullable=True)

    is_space_available: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    is_available_in_other_dept: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    other_dept_cost_and_utilization: Mapped[str | None] = mapped_column(String, nullable=True)

    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class UnexpectedExpenseDetail(Base):
    __tablename__ = "unexpected_expense_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    incharge_name_designation: Mapped[str] = mapped_column(String, nullable=False)
    expense_category: Mapped[str] = mapped_column(
        SAEnum(
            "Programs/Events", "Renovation", "New Civil Works", "Repair of Materials", "Admission Promotion",
            "Institution Promotion", "Sponsorship/Donation", "Others",
            name="unexpected_expense_category",
        ),
        nullable=False,
    )
    particulars: Mapped[str] = mapped_column(String, nullable=False)
    indent_reference_number: Mapped[str | None] = mapped_column(String, nullable=True)
    indent_date: Mapped[date | None] = mapped_column(Date, nullable=True)

    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class ITPurchaseDetail(Base):
    """Same shape as EquipmentPurchaseDetail — dedicated table so IT
    purchases (software, computers, UPS, networking, smart boards, etc.)
    follow the ADMIN_IT flow instead of ADMIN_PURCHASE."""

    __tablename__ = "it_purchase_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lab_name: Mapped[str] = mapped_column(String, nullable=False)
    requirement_type: Mapped[str] = mapped_column(
        SAEnum("As Per Curriculum", "Mandatory Requirement", "General", "Utilization", name="it_purchase_requirement_type"),
        nullable=False,
    )
    justification: Mapped[str | None] = mapped_column(String, nullable=True)
    equipment_specifications: Mapped[str] = mapped_column(String, nullable=False)

    main_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False)
    ancillary_equipment_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")
    landed_cost_total: Mapped[float] = mapped_column(Numeric, nullable=False)
    estimated_monthly_running_cost: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="0")

    revenue_generation_potential: Mapped[str | None] = mapped_column(String, nullable=True)

    previous_supplier_name: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_po_number: Mapped[str | None] = mapped_column(String, nullable=True)
    previous_purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    previous_price_paid: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    previous_life_span_expected: Mapped[str | None] = mapped_column(String, nullable=True)

    space_availability_confirmed: Mapped[bool] = mapped_column(nullable=False, server_default="true")
    cross_dept_available: Mapped[bool] = mapped_column(nullable=False, server_default="false")
    cross_dept_requirement_clearance: Mapped[str | None] = mapped_column(String, nullable=True)
    cross_dept_purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    cross_dept_cost: Mapped[float | None] = mapped_column(Numeric, nullable=True)
    cross_dept_utilization_pct: Mapped[float | None] = mapped_column(Numeric, nullable=True)

    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RecurringExpenditureDetail(Base):
    """Institution, department, department head, particulars and enclosures
    come from the parent Request/requester — this table holds only the
    recurring-specific field plus the indent line items."""

    __tablename__ = "recurring_expenditure_details"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    frequency: Mapped[str] = mapped_column(
        SAEnum("Monthly", "Quarterly", "Half-Yearly", "Annual", "Occasional", name="recurring_frequency"), nullable=False
    )
    indent_number: Mapped[str | None] = mapped_column(String, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class IndentLineItem(Base):
    """Shared indent table row, owned by any of INDENT_OWNER_TABLES via
    (owner_table, owner_id) rather than a per-type FK column."""

    __tablename__ = "indent_line_items"
    __table_args__ = (
        Index("ix_indent_line_items_owner", "owner_table", "owner_id"),
        CheckConstraint(f"owner_table IN {INDENT_OWNER_TABLES}", name="ck_indent_line_items_owner_table"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_table: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    serial_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    product_id: Mapped[str | None] = mapped_column(String, nullable=True)
    product_name: Mapped[str | None] = mapped_column(String, nullable=True)
    product_description: Mapped[str | None] = mapped_column(String, nullable=True)
    quantity: Mapped[float] = mapped_column(Numeric, nullable=False, server_default="1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    remarks: Mapped[list["IndentRemark"]] = relationship(
        back_populates="line_item", cascade="all, delete-orphan", order_by="IndentRemark.created_at"
    )


class IndentRemark(Base):
    """Free-text notes on a line item, left by whoever currently holds the
    request's stage. Port of indentDetails[].remarks[]."""

    __tablename__ = "indent_remarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    line_item_id: Mapped[int] = mapped_column(ForeignKey("indent_line_items.id"), nullable=False)
    by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    by_name: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    text: Mapped[str] = mapped_column(String, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    line_item: Mapped["IndentLineItem"] = relationship(back_populates="remarks")


class IndentChangeLog(Base):
    """Audit trail for edits to a detail's indent line items. Populated only
    by the update-indent-details service — never written directly by a
    client. Port of materialsChangeLog[]."""

    __tablename__ = "indent_change_log"
    __table_args__ = (
        Index("ix_indent_change_log_owner", "owner_table", "owner_id"),
        CheckConstraint(f"owner_table IN {INDENT_OWNER_TABLES}", name="ck_indent_change_log_owner_table"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    owner_table: Mapped[str] = mapped_column(String, nullable=False)
    owner_id: Mapped[int] = mapped_column(Integer, nullable=False)
    by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    by_name: Mapped[str | None] = mapped_column(String, nullable=True)
    role: Mapped[str | None] = mapped_column(String, nullable=True)
    action: Mapped[str] = mapped_column(
        SAEnum("added", "updated", "deleted", "imported", name="indent_change_action"), nullable=False
    )
    row_label: Mapped[str | None] = mapped_column(String, nullable=True)
    serial_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    product_id: Mapped[str | None] = mapped_column(String, nullable=True)
    field: Mapped[str | None] = mapped_column(String, nullable=True)
    old_value: Mapped[str | None] = mapped_column(String, nullable=True)
    new_value: Mapped[str | None] = mapped_column(String, nullable=True)
    remark: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
