"""Role-based access control helpers for user management.

Direct port of src/utils/rbac.js — keep this list and allowedRolesFor() in
lockstep with that file until the Node app is retired.
"""

# All assignable roles (mirrors the enum on the source User model).
ROLES: list[str] = [
    "REQUESTER",
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

# Roles that are scoped to a specific institution.
INSTITUTION_SCOPED_ROLES: list[str] = [
    "REQUESTER",
    "INSTITUTION_MANAGER",
    "ACCOUNTANT",
    "HEAD_OF_INSTITUTION",
]

# Roles allowed to access the User Management page at all.
USER_MANAGER_ROLES: list[str] = [
    "HEAD_OF_INSTITUTION",
    "CHAIRMAN_OFFICE",
    "DEAN_ADMIN",
    "CHAIRMAN",
]

# Roles allowed to view/change role -> permission grants (e.g. which roles
# can download attachments). Deliberately narrower than USER_MANAGER_ROLES:
# HEAD_OF_INSTITUTION only manages accounts within their own institution, but
# permission grants are global (apply to every role across every
# institution), so it's excluded here.
PERMISSION_MANAGER_ROLES: list[str] = [
    "CHAIRMAN_OFFICE",
    "DEAN_ADMIN",
    "CHAIRMAN",
]


def is_institution_scoped_role(role: str) -> bool:
    return role in INSTITUTION_SCOPED_ROLES


def allowed_roles_for(creator_role: str) -> list[str]:
    """Which roles a given creator may create / view / manage.

    - CHAIRMAN: everyone (including other chairmen)
    - HEAD_OF_INSTITUTION: requesters, institution managers, accountants (own institution only)
    - CHAIRMAN_OFFICE / DEAN_ADMIN: all roles except CHAIRMAN and their own role
    - everyone else: none
    """
    if creator_role == "CHAIRMAN":
        return list(ROLES)
    if creator_role == "HEAD_OF_INSTITUTION":
        return ["REQUESTER", "INSTITUTION_MANAGER", "ACCOUNTANT"]
    if creator_role in ("CHAIRMAN_OFFICE", "DEAN_ADMIN"):
        return [r for r in ROLES if r not in ("CHAIRMAN", creator_role)]
    return []
