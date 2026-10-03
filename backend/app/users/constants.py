"""Direct port of src/constants/user.constants.js."""

INSTITUTIONS: list[str] = [
    "SRMIST - E&T",
    "SRMIST - FSH",
    "SRMIST - Management",
    "SRMIST - SEAD",
    "EEC",
    "DENTAL",
    "SRM Nightingale School",
    "Others",
    # Sentinel for central roles that are not scoped to a single institution
    # (Chairman Office, Audit, Deans, etc.). Signup sends this when the
    # selected role does not require a college.
    "COMMON",
]

DEPARTMENTS: list[str] = [
    "Common",
    "Orthodontics",
    "Prosthodontics",
    "Conservative Dentistry & Endodontics",
    "Oral and Maxillofacial Surgery",
    "Periodontics & Oral Implantology",
    "Oral and Maxillofacial Pathology and Microbiology",
    "Public Health Dentistry",
    "Pediatric & Preventive Dentistry",
    "Oral Medicine and Oral Radiology",
    "Basic Medical Sciences",
    "Computer Science and Engineering",
    "CSE with specialization in Artificial Intelligence",
    "Computer Science and Engineering (CORE)",
    "CSE with specialization in Artificial Intelligence and Machine Learning",
    "CSE with Specialization in Big Data Analytics",
    "CSE with Specialization in Cyber Security",
    "Computer Science and Business Systems",
    "CSE with Specialization in Cloud Computing",
    "CSE with Specialization in Gaming Technology",
    "CSE with Specialization in Internet of Things",
    "Information Technology",
    "Bio Medical Engineering",
    "Biotechnology",
    "Civil Engineering",
    "Electrical and Electronics Engineering",
    "Electronics and Communication Engineering",
    "Mechanical Engineering",
    "Chemistry",
    "Language, Culture and Society (LCS)",
    "Mathematics",
    "Physics",
    "Architecture",
    "Commerce",
    "Film Technology",
    "Fashion Designing",
    "Journalism and Mass Communication",
    "Computer Science & Applications",
    "Language, Culture and Society",
    "Visual Communication",
    "Management",
    "Psychology",
    "Computer science",
    "Tamil",
    "English and foreign languages",
    "Automobile Engineering",
    "CSE Artificial Intelligence and Machine Learning",
    "CSE Cyber Security",
    "Computer Science and Design",
    "Robotics and Automation Engineering",
    "Artificial Intelligence and Data Science",
    "Computer Science and Business System",
    "M.B.A",
    "M.C.A",
    "M.E. Communication Systems",
    "M.E. Computer Science and Engineering",
    "M.E. Embedded System Technologies",
    "M.E. Engineering Design",
    "M.E. Structural Engineering",
    "English",
    "Maths",
    "Library",
    "Physical Education",
    "Counselling",
    "Management Studies",
]


# Institutions whose users of a given role form one shared pool: a pooled user
# can see/act on requests from every institution in their group. Roles not
# listed here (and institutions outside any group) stay scoped to their own
# institution.
_DENTAL_AND_SRMIST = {"SRMIST - E&T", "SRMIST - FSH", "SRMIST - Management", "SRMIST - SEAD", "DENTAL"}
INSTITUTION_GROUPS: dict[str, list[set[str]]] = {
    "INSTITUTION_MANAGER": [
        {"SRMIST - E&T", "SRMIST - SEAD"},
        {"SRMIST - Management", "SRMIST - FSH"},
    ],
    "ACCOUNTANT": [
        _DENTAL_AND_SRMIST,
        {"EEC", "SRM Nightingale School"},
    ],
}


def institutions_for(institution: str | None, role: str | None) -> list[str | None]:
    """Institutions whose records `role` at `institution` may handle."""
    for group in INSTITUTION_GROUPS.get(role or "", []):
        if institution in group:
            return sorted(group)
    return [institution]


def same_institution(a: str | None, b: str | None, role: str | None) -> bool:
    return b in institutions_for(a, role)
