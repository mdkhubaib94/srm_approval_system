from app.core.security import hash_password
from app.users.models import User


async def make_user(
    db_session,
    *,
    name: str = "Test User",
    employee_id: str,
    email: str,
    password: str = "secret123",
    role: str = "REQUESTER",
    institution: str | None = None,
    department: str | None = None,
) -> User:
    user = User(
        name=name,
        employee_id=employee_id,
        email=email.lower(),
        password_hash=hash_password(password),
        role=role,
        institution=institution,
        department=department,
    )
    db_session.add(user)
    await db_session.commit()
    await db_session.refresh(user)
    return user
