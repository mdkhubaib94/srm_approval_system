from datetime import date

from pydantic import BaseModel


class IndentLineItemIn(BaseModel):
    id: int | None = None
    serial_number: int | None = None
    product_id: str | None = None
    product_name: str | None = None
    product_description: str | None = None
    quantity: float | None = None


class MouDetailPayload(BaseModel):
    legal_opinion_obtained: bool
    mou_type: str
    organisation_name: str
    organisation_type: str
    organisation_type_specify: str | None = None
    domain_or_products: str
    validity_from: date
    validity_to: date
    industrial_visits_count: int = 0
    internships_paid: int = 0
    internships_unpaid: int = 0
    placement_offers_count: int = 0
    has_collaborative_project: bool = False
    has_guest_lectures_conducted: bool = False
    has_sponsorships_provided: bool = False
    revenue_generated: float = 0


class EquipmentPurchaseDetailPayload(BaseModel):
    lab_name: str
    requirement_type: str
    justification: str | None = None
    equipment_specifications: str
    main_equipment_cost: float
    ancillary_equipment_cost: float = 0
    landed_cost_total: float
    estimated_monthly_running_cost: float = 0
    revenue_generation_potential: str | None = None
    previous_supplier_name: str | None = None
    previous_po_number: str | None = None
    previous_purchase_date: date | None = None
    previous_price_paid: float | None = None
    previous_life_span_expected: str | None = None
    space_availability_confirmed: bool = True
    cross_dept_available: bool = False
    cross_dept_requirement_clearance: str | None = None
    cross_dept_purchase_date: date | None = None
    cross_dept_cost: float | None = None
    cross_dept_utilization_pct: float | None = None
    indent_details: list[IndentLineItemIn] = []


class GuestLectureDetailPayload(BaseModel):
    coordinator_name: str
    coordinator_phone: str
    programme_title: str
    target_audience: str
    mode: str
    mapped_course_semester: str
    professional_club_association: str | None = None
    expected_participants: int
    schedule_date: date
    schedule_time: str
    schedule_duration: str
    criteria_aligned: str
    satisfies_sdg_or_iks: bool = False
    sdg_iks_details: str | None = None
    speaker_category: str
    iqac_target_for_year: int
    iqac_conducted_so_far: int
    running_total_received_from_management: float = 0
    speaker_profile_attached: bool
    amount_sanctioned: float = 2500


class MaintenanceDetailPayload(BaseModel):
    location: str
    maintenance_type: str
    maintenance_type_specify: str | None = None
    category: str
    previous_fault_date_month: str | None = None
    previous_fault_reason: str | None = None
    amount_spent_so_far: float = 0


class SeminarParticipationDetailPayload(BaseModel):
    staff_qualification: str
    title_of_programme: str
    duration_from: date
    duration_to: date
    hosting_institution_address: str
    programme_scale: str
    nature_of_participation: str
    is_paper_referred: bool = False
    expenses_india_registration_fees: float = 0
    expenses_india_travel_allowance: float = 0
    expenses_india_stay_accommodation: float = 0
    expenses_india_total: float
    expenses_abroad_registration_fees: float = 0
    expenses_abroad_travel_allowance: float = 0
    expenses_abroad_stay_accommodation: float = 0
    expenses_abroad_other_funding_agency_arrangements: str | None = None
    historical_seminar_count: int = 0
    historical_workshop_count: int = 0
    historical_conference_national_count: int = 0
    historical_conference_international_count: int = 0
    historical_paper_presentation_count: int = 0


class SeminarHostingDetailPayload(BaseModel):
    subject: str
    coordinator_name: str
    coordinator_phone: str
    programme_scale: str
    duration_days: int
    schedule_from: date
    schedule_to: date | None = None
    target_audience: str
    association_head: str
    exp_posters_and_brochures: float = 0
    exp_invitations_and_certificates: float = 0
    exp_prizes: float = 0
    exp_mementos: float = 0
    exp_gifts_to_judges: float = 0
    exp_gifts_to_chief_guest: float = 0
    exp_gifts_to_others: float = 0
    exp_refreshments_chief_guest: float = 0
    exp_refreshments_participants: float = 0
    exp_conference_kit: float = 0
    exp_decoration: float = 0
    exp_miscellaneous: float = 0
    receipts_registration_fees: float = 0
    receipts_sponsorships: float = 0
    receipts_statutory_grants: float = 0
    receipts_other_receipts: float = 0
    management_subsidy_requested: float


class MachineRepairDetailPayload(BaseModel):
    subject: str
    machine_name: str
    machine_no: str
    brand: str
    machine_value: float | None = None
    date_of_purchase: date | None = None
    installation_date: date | None = None
    machine_incharge: str
    nature_of_problem: str
    not_working_since: date
    reported_on: date
    reported_to_whom: str
    number_of_times_repaired_previously: int = 0
    amount_spent_so_far_on_repairs: float = 0
    current_repair_estimate: float
    is_under_amc: bool = False
    amc_periodicity: str | None = None
    amc_company_name: str | None = None
    amc_address: str | None = None
    amc_contact_person: str | None = None
    amc_contact_mobile: str | None = None
    amc_commencement_date: date | None = None
    amc_expiry_date: date | None = None
    estimated_rectification_days: int


class GeneralDetailPayload(BaseModel):
    general_category: str
    event_name: str | None = None
    target_dates_from: date | None = None
    target_dates_to: date | None = None
    target_dates_total_days: int | None = None
    indent_details: list[IndentLineItemIn] = []


class DiscontinuedStudentDetailPayload(BaseModel):
    student_name: str
    register_number: str
    course_and_branch: str
    study_mode: str
    admission_category: str
    date_of_admission: date
    current_semester: int
    current_year: int
    father_name: str
    mother_name: str
    last_date_of_class_attended: date
    number_of_days_attended: int
    attendance_percentage: float
    class_coordinator_signature_date: date | None = None
    arrear_sem1: int = 0
    arrear_sem2: int = 0
    arrear_sem3: int = 0
    arrear_sem4: int = 0
    arrear_sem5: int = 0
    arrear_sem6: int = 0
    reason_for_discontinuation: str
    hostel_warden_cleared: bool = False
    librarian_cleared: bool = False
    student_counsellor_cleared: bool = False
    accounts_outstanding_balance: float = 0
    remaining_fees_to_be_collected: bool
    tc_issuance_authorized: bool


class FeesConcessionDetailPayload(BaseModel):
    student_name: str
    registration_no: str
    year_of_admission: int
    course_branch_year: str
    sports_quota_type: str
    initial_admission_concession_percentage: float
    prizes_won_previous_year: str | None = None
    current_year_performance_details: str | None = None
    next_year_approval_details: str | None = None
    attitude_and_behaviour: str
    total_cgpa: float
    attendance_excluding_od: float | None = None
    pass_percentage_cgpa: float | None = None
    arrears_sem1: int = 0
    arrears_sem2: int = 0
    arrears_sem3: int = 0
    arrears_sem4: int = 0
    arrears_sem5: int = 0
    arrears_sem6: int = 0
    total_arrears_as_on_date: int = 0
    original_concession_given_by_whom: str | None = None
    original_concession_referred_contact_person: str | None = None
    original_concession_contact_number: str | None = None
    remarks_by_hod: str | None = None
    remarks_by_physical_director: str | None = None
    details_of_enclosures: str | None = None


class NonBudgetedAssetDetailPayload(BaseModel):
    incharge_name: str
    incharge_designation: str
    asset_specifications: str
    utilization_category: str
    justification: str
    main_equipment_cost: float
    ancillary_equipment_cost: float = 0
    landed_cost: float
    monthly_running_cost: float = 0
    reason_not_in_current_budget: str
    revenue_generation_details: str | None = None
    previous_supplier_name: str | None = None
    previous_purchase_date: date | None = None
    previous_price_paid: float | None = None
    previous_expected_lifespan: str | None = None
    is_space_available: bool = True
    is_available_in_other_dept: bool = False
    other_dept_cost_and_utilization: str | None = None
    indent_details: list[IndentLineItemIn] = []


class UnexpectedExpenseDetailPayload(BaseModel):
    incharge_name_designation: str
    expense_category: str
    particulars: str
    indent_reference_number: str | None = None
    indent_date: date | None = None
    indent_details: list[IndentLineItemIn] = []


class ITPurchaseDetailPayload(BaseModel):
    lab_name: str
    requirement_type: str
    justification: str | None = None
    equipment_specifications: str
    main_equipment_cost: float
    ancillary_equipment_cost: float = 0
    landed_cost_total: float
    estimated_monthly_running_cost: float = 0
    revenue_generation_potential: str | None = None
    previous_supplier_name: str | None = None
    previous_po_number: str | None = None
    previous_purchase_date: date | None = None
    previous_price_paid: float | None = None
    previous_life_span_expected: str | None = None
    space_availability_confirmed: bool = True
    cross_dept_available: bool = False
    cross_dept_requirement_clearance: str | None = None
    cross_dept_purchase_date: date | None = None
    cross_dept_cost: float | None = None
    cross_dept_utilization_pct: float | None = None
    indent_details: list[IndentLineItemIn] = []


class RecurringExpenditureDetailPayload(BaseModel):
    frequency: str
    indent_details: list[IndentLineItemIn] = []


# Maps a details_model name to the Pydantic schema that validates its create
# payload. All 14 production types are wired up (Phase 2 landed the first 2
# as reference shapes; Phase 3 added the remaining 12 the same way).
DETAIL_PAYLOAD_SCHEMAS: dict[str, type[BaseModel]] = {
    "MouDetail": MouDetailPayload,
    "GuestLectureDetail": GuestLectureDetailPayload,
    "EquipmentPurchaseDetail": EquipmentPurchaseDetailPayload,
    "MaintenanceDetail": MaintenanceDetailPayload,
    "SeminarParticipationDetail": SeminarParticipationDetailPayload,
    "SeminarHostingDetail": SeminarHostingDetailPayload,
    "MachineRepairDetail": MachineRepairDetailPayload,
    "GeneralDetail": GeneralDetailPayload,
    "DiscontinuedStudentDetail": DiscontinuedStudentDetailPayload,
    "FeesConcessionDetail": FeesConcessionDetailPayload,
    "NonBudgetedAssetDetail": NonBudgetedAssetDetailPayload,
    "UnexpectedExpenseDetail": UnexpectedExpenseDetailPayload,
    "ITPurchaseDetail": ITPurchaseDetailPayload,
    "RecurringExpenditureDetail": RecurringExpenditureDetailPayload,
}
