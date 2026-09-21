"""Business logic for user management. Reference: src/controllers/userController.js."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser
from app.core.rbac import allowed_roles_for, is_institution_scoped_role
from app.core.security import hash_password
from app.users import repository as repo
from app.users.constants import INSTITUTIONS
from app.users.models import User

DEFAULT_PASSWORD = "123456"


class UsersServiceError(Exception):
    def __init__(self, status_code: int, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.message = message


class InvalidInstitutionError(ValueError):
    pass


def norm(value: str | None) -> str | None:
    if value is None:
        return None
    trimmed = value.strip()
    return trimmed or None


def norm_email(value: str | None) -> str | None:
    normalized = norm(value)
    return normalized.lower() if normalized else None


def build_scope_roles(caller_role: str, role_filter: str | None) -> list[str] | None:
    """Which roles the caller may list/manage, optionally narrowed to one
    role. Returns None if the caller may manage nobody, or if role_filter
    names a role outside what they're allowed to see."""
    allowed = allowed_roles_for(caller_role)
    if not allowed:
        return None
    if role_filter:
        if role_filter not in allowed:
            return None
        return [role_filter]
    return allowed


def can_manage_target(caller_role: str, caller_institution: str | None, target_role: str, target_institution: str | None) -> bool:
    allowed = allowed_roles_for(caller_role)
    if target_role not in allowed:
        return False
    if caller_role == "HEAD_OF_INSTITUTION" and target_institution != caller_institution:
        return False
    return True


def resolve_institution(caller_role: str, caller_institution: str | None, role: str, requested_institution: str | None) -> str | None:
    """Resolve the institution to store for a given role + caller, or raise
    InvalidInstitutionError with a user-safe message."""
    if not is_institution_scoped_role(role):
        return None  # central roles have no institution

    if caller_role == "HEAD_OF_INSTITUTION":
        return caller_institution

    inst = norm(requested_institution)
    if not inst:
        raise InvalidInstitutionError("Institution is required for this role.")
    if inst not in INSTITUTIONS:
        raise InvalidInstitutionError(f"Invalid institution: {inst}")
    return inst


async def get_me(db: AsyncSession, current_user: CurrentUser) -> User:
    user = await repo.get_user_by_id(db, current_user.id)
    if user is None:
        raise UsersServiceError(404, "User not found")
    return user


async def list_users(db: AsyncSession, current_user: CurrentUser, role_filter: str | None) -> list[User]:
    roles = build_scope_roles(current_user.role, role_filter)
    if roles is None:
        return []
    institution = current_user.institution if current_user.role == "HEAD_OF_INSTITUTION" else None
    return await repo.list_users_by_roles(db, roles, institution=institution)


async def get_user_by_email(db: AsyncSession, current_user: CurrentUser, email: str) -> User:
    normalized = norm_email(email)
    user = await repo.get_user_by_email(db, normalized)
    if user is None:
        raise UsersServiceError(404, "User not found")

    is_self = user.id == current_user.id
    if not is_self and not can_manage_target(current_user.role, current_user.institution, user.role, user.institution):
        # 404, not 403 — do not confirm this account exists to a caller who
        # cannot manage it.
        raise UsersServiceError(404, "User not found")

    return user


async def create_user(
    db: AsyncSession,
    current_user: CurrentUser,
    *,
    role: str,
    name: str | None,
    employee_id: str | None,
    email: str | None,
    phone: str | None,
    department: str | None,
    institution: str | None,
) -> User:
    allowed = allowed_roles_for(current_user.role)
    if role not in allowed:
        raise UsersServiceError(403, f"You are not allowed to create the role: {role}")

    norm_name = norm(name)
    norm_employee_id = norm(employee_id)
    norm_email_value = norm_email(email)
    if not norm_name or not norm_employee_id or not norm_email_value:
        raise UsersServiceError(400, "name, employeeID and email are required.")

    norm_department = norm(department)
    if role == "REQUESTER" and not norm_department:
        raise UsersServiceError(400, "Department is required for a Head of Department (requester).")

    try:
        resolved_institution = resolve_institution(current_user.role, current_user.institution, role, institution)
    except InvalidInstitutionError as exc:
        raise UsersServiceError(400, str(exc))

    existing = await repo.get_user_by_employee_id_or_email(db, norm_employee_id, norm_email_value)
    if existing is not None:
        raise UsersServiceError(409, "A user with that employeeID or email already exists.")

    user = User(
        name=norm_name,
        employee_id=norm_employee_id,
        email=norm_email_value,
        phone=norm(phone),
        password_hash=hash_password(DEFAULT_PASSWORD),
        role=role,
        institution=resolved_institution,
        department=norm_department if role == "REQUESTER" else None,
    )
    repo.add_user(db, user)
    await repo.commit(db)
    await repo.refresh(db, user)
    return user


async def bulk_create_users(
    db: AsyncSession, current_user: CurrentUser, *, role: str, institution: str | None, rows: list
) -> dict:
    allowed = allowed_roles_for(current_user.role)
    if role not in allowed:
        raise UsersServiceError(403, f"You are not allowed to create the role: {role}")

    if not rows:
        raise UsersServiceError(400, "No rows provided.")

    try:
        resolved_institution = resolve_institution(current_user.role, current_user.institution, role, institution)
    except InvalidInstitutionError as exc:
        raise UsersServiceError(400, str(exc))

    password_hash = hash_password(DEFAULT_PASSWORD)
    wants_department = role == "REQUESTER"

    created: list[dict] = []
    skipped: list[dict] = []
    seen_employee_ids: set[str] = set()
    seen_emails: set[str] = set()

    for i, row in enumerate(rows):
        row_num = i + 1
        name = norm(row.name)
        employee_id = norm(row.employee_id)
        email = norm_email(row.email)
        phone = norm(row.phone)
        department = norm(row.department)

        if not name or not employee_id or not email:
            skipped.append({"row": row_num, "employeeID": employee_id, "email": email, "reason": "Missing name, employeeID or email"})
            continue
        if wants_department and not department:
            skipped.append({"row": row_num, "employeeID": employee_id, "email": email, "reason": "Missing department"})
            continue
        if employee_id in seen_employee_ids or email in seen_emails:
            skipped.append({"row": row_num, "employeeID": employee_id, "email": email, "reason": "Duplicate within the uploaded file"})
            continue

        existing = await repo.get_user_by_employee_id_or_email(db, employee_id, email)
        if existing is not None:
            skipped.append({"row": row_num, "employeeID": employee_id, "email": email, "reason": "employeeID or email already exists"})
            continue

        user = User(
            name=name,
            employee_id=employee_id,
            email=email,
            phone=phone,
            password_hash=password_hash,
            role=role,
            institution=resolved_institution,
            department=department if wants_department else None,
        )
        repo.add_user(db, user)
        try:
            await repo.flush(db)
        except Exception as exc:  # pragma: no cover - defensive, mirrors source's per-row try/catch
            await repo.rollback(db)
            skipped.append({"row": row_num, "employeeID": employee_id, "email": email, "reason": str(exc) or "Create failed"})
            continue

        seen_employee_ids.add(employee_id)
        seen_emails.add(email)
        created.append({"row": row_num, "employeeID": employee_id, "email": email, "name": name})

    await repo.commit(db)

    return {
        "role": role,
        "institution": resolved_institution,
        "total": len(rows),
        "createdCount": len(created),
        "skippedCount": len(skipped),
        "created": created,
        "skipped": skipped,
    }


async def update_user(
    db: AsyncSession,
    current_user: CurrentUser,
    user_id: int,
    *,
    name: str | None,
    phone: str | None,
    email: str | None,
    institution: str | None,
    department: str | None,
) -> User:
    target = await repo.get_user_by_id(db, user_id)
    if target is None:
        raise UsersServiceError(404, "User not found")
    if not can_manage_target(current_user.role, current_user.institution, target.role, target.institution):
        raise UsersServiceError(403, "You cannot manage this user.")

    if name is not None:
        target.name = norm(name)
    if phone is not None:
        target.phone = norm(phone)

    if email is not None:
        new_email = norm_email(email)
        if new_email and new_email != target.email:
            existing = await repo.get_user_by_email_excluding_id(db, new_email, target.id)
            if existing is not None:
                raise UsersServiceError(409, "Email already in use.")
            target.email = new_email

    # Institution: HoI cannot change it (locked to own). Others may, for scoped roles.
    if institution is not None and current_user.role != "HEAD_OF_INSTITUTION" and is_institution_scoped_role(target.role):
        inst = norm(institution)
        if inst and inst not in INSTITUTIONS:
            raise UsersServiceError(400, f"Invalid institution: {inst}")
        target.institution = inst

    # Department: only meaningful for requesters (free-text).
    if department is not None and target.role == "REQUESTER":
        target.department = norm(department)

    await repo.commit(db)
    await repo.refresh(db, target)
    return target


async def delete_user(db: AsyncSession, current_user: CurrentUser, user_id: int) -> None:
    target = await repo.get_user_by_id(db, user_id)
    if target is None:
        raise UsersServiceError(404, "User not found")
    if not can_manage_target(current_user.role, current_user.institution, target.role, target.institution):
        raise UsersServiceError(403, "You cannot manage this user.")
    if target.id == current_user.id:
        raise UsersServiceError(400, "You cannot delete your own account.")

    await repo.delete_user(db, target)
    await repo.commit(db)


async def update_me(db: AsyncSession, current_user: CurrentUser, *, phone: str | None, department: str | None) -> User:
    user = await repo.get_user_by_id(db, current_user.id)
    if user is None:
        raise UsersServiceError(404, "User not found")

    if phone is not None:
        user.phone = norm(phone)
    if department is not None and user.role == "REQUESTER":
        user.department = norm(department)

    await repo.commit(db)
    await repo.refresh(db, user)
    return user
