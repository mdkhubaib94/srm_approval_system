export const UserRole = Object.freeze({
  REQUESTER:                "REQUESTER",
  INSTITUTION_MANAGER:      "INSTITUTION_MANAGER",
  ACCOUNTANT:               "ACCOUNTANT",
  HEAD_OF_INSTITUTION:      "HEAD_OF_INSTITUTION",
  CHAIRMAN_OFFICE:          "CHAIRMAN_OFFICE",
  HR_HEAD:                  "HR_HEAD",
  MMA:                      "MMA",
  MANAGER_DATA_MANAGEMENT:  "MANAGER_DATA_MANAGEMENT",
  AUDIT:                    "AUDIT",
  GM_FINANCE:               "GM_FINANCE",
  DIRECTOR_ADMISSIONS:      "DIRECTOR_ADMISSIONS",
  DIRECTOR_RESEARCH:        "DIRECTOR_RESEARCH",
  DIRECTOR_ADMIN:               "DIRECTOR_ADMIN",
  CHIEF_DIRECTOR:           "CHIEF_DIRECTOR",
  CHAIRMAN:                 "CHAIRMAN",
});

// Detail models whose request type carries a materials/indent line-item
// table (see components IndentInformation.jsx and the dedicated
// requests/[id]/materials page, and backend requestController's
// INDENT_CAPABLE_MODELS — keep all three in sync).
export const INDENT_CAPABLE_MODELS = Object.freeze([
  "NonBudgetedAssetDetail",
  "EquipmentPurchaseDetail",
  "ITPurchaseDetail",
  "GeneralDetail",
  "UnexpectedExpenseDetail",
  "RecurringExpenditureDetail",
]);

export const RequestCategory = Object.freeze({
  ADMIN_HR:             "ADMIN_HR",
  ADMIN_PURCHASE:       "ADMIN_PURCHASE",
  ADMIN_IT:             "ADMIN_IT",
  ADMIN_MAINTENANCE:    "ADMIN_MAINTENANCE",
  ACADEMIC_FINANCE:     "ACADEMIC_FINANCE",
  ACADEMIC_NON_FINANCE: "ACADEMIC_NON_FINANCE",
  RESEARCH:             "RESEARCH",
  NON_BUDGETED:         "NON_BUDGETED",
  OTHER:                "OTHER",
});

/** Human-readable labels for each category */
export const REQUEST_CATEGORY_LABELS = {
  ADMIN_HR:             "Admin — HR",
  ADMIN_PURCHASE:       "Admin — Purchase",
  ADMIN_IT:             "Admin — IT",
  ADMIN_MAINTENANCE:    "Admin — Maintenance",
  ACADEMIC_FINANCE:     "Academic — Finance",
  ACADEMIC_NON_FINANCE: "Academic — Non-Finance",
  RESEARCH:             "Research",
  NON_BUDGETED:         "Non-Budgeted",
  OTHER:                "Other",
};

/** Ordered approval stage sequences per category (mirrors backend request.constants.js) */
export const CATEGORY_STAGE_SEQUENCES = Object.freeze({
  ADMIN_HR: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "HR_HEAD",
    "DIRECTOR_ADMIN",
    "CHIEF_DIRECTOR",
    "CHAIRMAN",
  ],
  ADMIN_PURCHASE: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "MMA",
    "AUDIT",
    "DIRECTOR_ADMIN",
    "CHAIRMAN",
  ],
  ADMIN_IT: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "MANAGER_DATA_MANAGEMENT",
    "AUDIT",
    "DIRECTOR_ADMISSIONS",
    "DIRECTOR_ADMIN",
    "CHAIRMAN",
  ],
  ADMIN_MAINTENANCE: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "MMA",
    "AUDIT",
    "DIRECTOR_ADMIN",
    "CHIEF_DIRECTOR",
    "CHAIRMAN",
  ],
  ACADEMIC_FINANCE: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "AUDIT",
    "GM_FINANCE",
    "DIRECTOR_ADMIN",
    "CHAIRMAN",
  ],
  ACADEMIC_NON_FINANCE: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "DIRECTOR_ADMIN",
    "CHAIRMAN",
  ],
  RESEARCH: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "AUDIT",
    "DIRECTOR_RESEARCH",
    "DIRECTOR_ADMIN",
    "CHIEF_DIRECTOR",
    "CHAIRMAN",
  ],
  NON_BUDGETED: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "GM_FINANCE",
    "CHAIRMAN",
  ],
  // OTHER only flows up to the Head of Institution, who must then re-route it
  // to a real approval category (which supplies the stages after HOI).
  OTHER: [
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
  ],
});

/**
 * Fixed approval category per detailsModel (mirrors backend request.constants.js).
 * The requester cannot override this — the backend derives it authoritatively.
 * GeneralDetail is null here — its category is driven by generalCategory (see below).
 */
export const DETAILS_MODEL_DEFAULT_CATEGORY = {
  EquipmentPurchaseDetail:    "ADMIN_PURCHASE",//done
  ITPurchaseDetail:           "ADMIN_IT",//done
  MaintenanceDetail:          "ADMIN_MAINTENANCE",//done
  MachineRepairDetail:        "ADMIN_MAINTENANCE",//done
  NonBudgetedAssetDetail:     "NON_BUDGETED",//done
  GuestLectureDetail:         "ACADEMIC_FINANCE",//done
  SeminarParticipationDetail: "ACADEMIC_FINANCE",//done
  SeminarHostingDetail:       "ACADEMIC_FINANCE",//done
  UnexpectedExpenseDetail:    "NON_BUDGETED",//done
  FeesConcessionDetail:       "ACADEMIC_FINANCE",//done
  DiscontinuedStudentDetail:  "ACADEMIC_NON_FINANCE",//done
  MouDetail:                  "RESEARCH",//done
  RecurringExpenditureDetail: "OTHER",//done
  GeneralDetail:              null,
};

/**
 * For GeneralDetail requests, maps the inner generalCategory value
 * to the correct approval pipeline category.
 */
export const GENERAL_CATEGORY_DEFAULT_CATEGORY = {
  "Staff Resignation":        "ADMIN_HR",
  "Maternity Leave":          "ADMIN_HR",
  "Medical Leave":            "ADMIN_HR",
  "On duty Leave":            "ADMIN_HR",
  "Long Leave":               "ADMIN_HR",
  "No Objection Certificate": "RESEARCH",
  "Refund":                   "ACADEMIC_FINANCE",
  "Industrial Visit":         "ACADEMIC_NON_FINANCE",
  "Anti ragging Event":       "ACADEMIC_FINANCE",
  "Camp":                     "ACADEMIC_FINANCE",
  "Awareness Programme":      "ACADEMIC_FINANCE",
  "Yoga Event":               "ACADEMIC_FINANCE",
  "Others":                   "OTHER",
};