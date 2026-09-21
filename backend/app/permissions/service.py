"""Business logic for the role -> permission grants used to gate optional UI
capabilities. Currently a single permission exists: DOWNLOAD_ATTACHMENTS,
which controls whether a role sees the "Download" option for request and
query-reply PDF attachments on the request detail page. Previewing a PDF
("View") is unaffected — both View and Download fetch the same file-serving
endpoint, so this is a UI policy toggle, not a file-access control."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.core.rbac import ROLES
from app.permissions import repository as repo

DOWNLOAD_ATTACHMENTS = "download_attachments"

PERMISSION_LABELS: dict[str, str] = {
    DOWNLOAD_ATTACHMENTS: "Download Attachments",
}


class PermissionsServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


def _sort_roles(roles: list[str]) -> list[str]:
    return sorted(set(roles), key=ROLES.index)


async def list_permissions(db: AsyncSession) -> list[dict]:
    out = []
    for key, label in PERMISSION_LABELS.items():
        roles = await repo.get_roles_for_key(db, key)
        out.append({"key": key, "label": label, "roles": _sort_roles(roles)})
    return out


async def update_permission_roles(db: AsyncSession, permission_key: str, roles: list[str]) -> dict:
    if permission_key not in PERMISSION_LABELS:
        raise PermissionsServiceError(404, f"Unknown permission: {permission_key}")

    invalid = [r for r in roles if r not in ROLES]
    if invalid:
        raise PermissionsServiceError(400, f"Invalid role(s): {', '.join(invalid)}")

    deduped = _sort_roles(roles)
    await repo.replace_roles_for_key(db, permission_key, deduped)
    return {"key": permission_key, "label": PERMISSION_LABELS[permission_key], "roles": deduped}


async def get_my_permissions(db: AsyncSession, current_user: CurrentUser) -> dict[str, bool]:
    out = {}
    for key in PERMISSION_LABELS:
        roles = await repo.get_roles_for_key(db, key)
        out[key] = current_user.role in roles
    return out
