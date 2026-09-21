"""The approval-workflow engine. Direct port of src/constants/request.constants.js.

Pure, dependency-free (no DB session, no FastAPI) so it can be unit-tested
with plain Python values — this and access.py are the two highest-risk-of-
subtle-bug modules in the source app.
"""

# ─── All individual stage names (union of all category sequences) ────────────
ALL_STAGES: list[str] = [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "HR_HEAD",
    "MMA",
    "MANAGER_DATA_MANAGEMENT",
    "AUDIT",
    "MANAGER_ACCOUNTS",
    "GM_FINANCE",
    "DIRECTOR_ADMISSIONS",
    "DIRECTOR_RESEARCH",
    "DEAN_ADMIN",
    "CHIEF_DIRECTOR",
    "CHAIRMAN",
]

# Stages scoped to the request's institution (same institution as requester)
INSTITUTION_SCOPED_STAGES: list[str] = [
    "REQUESTER",
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
]

# ─── Per-category ordered stage sequences ────────────────────────────────────
# All tracks share the first 4 stages, then branch after CHAIRMAN_OFFICE.
CATEGORY_STAGE_SEQUENCES: dict[str, list[str]] = {
    "ADMIN_HR": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "HR_HEAD",
        "DEAN_ADMIN",
        "CHIEF_DIRECTOR",
        "CHAIRMAN",
    ],
    "ADMIN_PURCHASE": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "MMA",
        "AUDIT",
        "MANAGER_ACCOUNTS",
        "DEAN_ADMIN",
        "CHAIRMAN",
    ],
    "ADMIN_IT": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "MANAGER_DATA_MANAGEMENT",
        "AUDIT",
        "MANAGER_ACCOUNTS",
        "DIRECTOR_ADMISSIONS",
        "DEAN_ADMIN",
        "CHAIRMAN",
    ],
    "ADMIN_MAINTENANCE": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "MMA",
        "AUDIT",
        "MANAGER_ACCOUNTS",
        "DEAN_ADMIN",
        "CHIEF_DIRECTOR",
        "CHAIRMAN",
    ],
    "ACADEMIC_FINANCE": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "AUDIT",
        "GM_FINANCE",
        "DEAN_ADMIN",
        "CHAIRMAN",
    ],
    "ACADEMIC_NON_FINANCE": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "DEAN_ADMIN",
        "CHAIRMAN",
    ],
    "RESEARCH": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "AUDIT",
        "MANAGER_ACCOUNTS",
        "DIRECTOR_RESEARCH",
        "DEAN_ADMIN",
        "CHIEF_DIRECTOR",
        "CHAIRMAN",
    ],
    "NON_BUDGETED": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "GM_FINANCE",
        "CHAIRMAN",
    ],
    # OTHER only flows up to the Head of Institution, who must then re-route it
    # to a real approval category. The stages after HOI come from the sequence
    # of the category the HOI selects (via get_next_stage on the new category).
    "OTHER": [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
    ],
}

# All valid request category keys
REQUEST_CATEGORIES: list[str] = list(CATEGORY_STAGE_SEQUENCES.keys())

# ─── Stage → Role mapping (used by the cron worker for SLA tracking) ─────────
STAGE_ROLES: dict[str, list[str]] = {stage: [stage] for stage in ALL_STAGES}

# Institution shortforms for Request ID generation
INSTITUTION_SHORTFORMS: dict[str, str] = {
    "SRMIST - E&T": "ENT",
    "SRMIST - FSH": "FSH",
    "SRMIST - Management": "MGT",
    "SRMIST - SEAD": "SEAD",
    "EEC": "EEC",
    "DENTAL": "DENT",
    "SRM Nightingale School": "NHS",
    "Others": "OTH",
}

# Department shortforms for Request ID generation
DEPARTMENT_SHORTFORMS: dict[str, str] = {
    "Orthodontics": "ORTHO",
    "Prosthodontics": "PROS",
    "Conservative Dentistry & Endodontics": "CDE",
    "Oral and Maxillofacial Surgery": "OMFS",
    "Periodontics & Oral Implantology": "PERIO",
    "Oral and Maxillofacial Pathology and Microbiology": "OMPM",
    "Public Health Dentistry": "PHD",
    "Pediatric & Preventive Dentistry": "PPD",
    "Oral Medicine and Oral Radiology": "OMOR",
    "Basic Medical Sciences": "BMS",
    "Computer Science and Engineering": "CSE",
    "CSE with specialization in Artificial Intelligence": "CSEAI",
    "Computer Science and Engineering (CORE)": "CSEC",
    "CSE with specialization in Artificial Intelligence and Machine Learning": "CSEAIML",
    "CSE with Specialization in Big Data Analytics": "CSEBDA",
    "CSE with Specialization in Cyber Security": "CSECS",
    "Computer Science and Business Systems": "CSBS",
    "CSE with Specialization in Cloud Computing": "CSECC",
    "CSE with Specialization in Gaming Technology": "CSEGT",
    "CSE with Specialization in Internet of Things": "CSEIOT",
    "Information Technology": "IT",
    "Bio Medical Engineering": "BME",
    "Biotechnology": "BT",
    "Civil Engineering": "CE",
    "Electrical and Electronics Engineering": "EEE",
    "Electronics and Communication Engineering": "ECE",
    "Mechanical Engineering": "ME",
    "Chemistry": "CHEM",
    "Language, Culture and Society (LCS)": "LCS",
    "Mathematics": "MATH",
    "Physics": "PHY",
    "Architecture": "ARCH",
    "Commerce": "COMM",
    "Film Technology": "FILM",
    "Fashion Designing": "FD",
    "Journalism and Mass Communication": "JMC",
    "Computer Science & Applications": "CSA",
    "Language, Culture and Society": "LCS",
    "Visual Communication": "VC",
    "Management": "MGT",
    "Psychology": "PSY",
    "Computer science": "CS",
    "Tamil": "TAM",
    "English and foreign languages": "EFL",
    "Automobile Engineering": "AUTO",
    "CSE Artificial Intelligence and Machine Learning": "CSEAIML",
    "CSE Cyber Security": "CSECS",
    "Computer Science and Design": "CSD",
    "Robotics and Automation Engineering": "RAE",
    "Artificial Intelligence and Data Science": "AIDS",
    "Computer Science and Business System": "CSBS",
    "M.B.A": "MBA",
    "M.C.A": "MCA",
    "M.E. Communication Systems": "MECS",
    "M.E. Computer Science and Engineering": "MECSE",
    "M.E. Embedded System Technologies": "MEEST",
    "M.E. Engineering Design": "MEED",
    "M.E. Structural Engineering": "MESE",
    "English": "ENG",
    "Maths": "MATH",
    "Library": "LIB",
    "Physical Education": "PE",
    "Counselling": "COUN",
    "Management Studies": "MS",
    "Others": "OTH",
}

# ─── Approval category derivation (server-side source of truth) ─────────────
# The requester cannot choose the approval flow: it is fixed by the request
# type (details_model) and, for GeneralDetail, by the selected general_category.

DETAILS_MODEL_CATEGORY: dict[str, str | None] = {
    "EquipmentPurchaseDetail": "ADMIN_PURCHASE",
    "ITPurchaseDetail": "ADMIN_IT",
    "MaintenanceDetail": "ADMIN_MAINTENANCE",
    "MachineRepairDetail": "ADMIN_MAINTENANCE",
    "NonBudgetedAssetDetail": "NON_BUDGETED",
    "GuestLectureDetail": "ACADEMIC_FINANCE",
    "SeminarParticipationDetail": "ACADEMIC_FINANCE",
    "SeminarHostingDetail": "ACADEMIC_FINANCE",
    "UnexpectedExpenseDetail": "NON_BUDGETED",
    "FeesConcessionDetail": "ACADEMIC_FINANCE",
    "DiscontinuedStudentDetail": "ACADEMIC_NON_FINANCE",
    "MouDetail": "RESEARCH",
    "RecurringExpenditureDetail": "OTHER",  # routes up to HOI, who re-routes
    "GeneralDetail": None,  # derived from general_category below
}

GENERAL_CATEGORY_CATEGORY: dict[str, str] = {
    "Staff Resignation": "ADMIN_HR",
    "Maternity Leave": "ADMIN_HR",
    "Medical Leave": "ADMIN_HR",
    "On duty Leave": "ADMIN_HR",
    "Long Leave": "ADMIN_HR",
    "No Objection Certificate": "RESEARCH",
    "Refund": "ACADEMIC_FINANCE",
    "Industrial Visit": "ACADEMIC_NON_FINANCE",
    "Anti ragging Event": "ACADEMIC_FINANCE",
    "Camp": "ACADEMIC_FINANCE",
    "Awareness Programme": "ACADEMIC_FINANCE",
    "Yoga Event": "ACADEMIC_FINANCE",
    "Others": "OTHER",
}

# 14 production detail model names (mirrors Request.detailsModel's Mongoose
# enum) — GenericDetail is deliberately excluded, see requests/details/registry.py.
DETAILS_MODEL_NAMES: list[str] = [
    "MouDetail",
    "GuestLectureDetail",
    "EquipmentPurchaseDetail",
    "MaintenanceDetail",
    "SeminarParticipationDetail",
    "SeminarHostingDetail",
    "MachineRepairDetail",
    "GeneralDetail",
    "DiscontinuedStudentDetail",
    "FeesConcessionDetail",
    "NonBudgetedAssetDetail",
    "UnexpectedExpenseDetail",
    "ITPurchaseDetail",
    "RecurringExpenditureDetail",
]


def get_next_stage(category: str | None, current_stage: str | None) -> str | None:
    """The next stage for a given category and current stage, or None if at
    the end / the category is unknown."""
    seq = CATEGORY_STAGE_SEQUENCES.get(category or "")
    if not seq:
        return None
    try:
        index = seq.index(current_stage)
    except ValueError:
        return None
    if index >= len(seq) - 1:
        return None
    return seq[index + 1]


def is_institution_scoped(stage: str | None) -> bool:
    return stage in INSTITUTION_SCOPED_STAGES


def derive_request_category(details_model: str, general_category: str | None = None) -> str | None:
    """Derive the approval category for a request. Returns None if
    underivable (unknown details_model, or GeneralDetail with an unmapped
    general_category)."""
    if details_model == "GeneralDetail":
        return GENERAL_CATEGORY_CATEGORY.get(general_category or "")
    return DETAILS_MODEL_CATEGORY.get(details_model)
