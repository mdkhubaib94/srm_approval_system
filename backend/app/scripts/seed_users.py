"""Seed script - creates one dummy user per role. Direct port of
src/scripts/seedUsers.js.

Run: python -m app.scripts.seed_users

All accounts use the password: 123456
Existing users (matched by employee_id or email) are skipped, not overwritten.
"""

import asyncio

from sqlalchemy import or_, select

from app.core.security import hash_password
from app.scripts._bootstrap import get_sessionmaker
from app.users.models import User

DEFAULT_PASSWORD = "123456"

# Institution-scoped roles need an institution value; campus-wide roles don't.
SEED_USERS = [
    {"name": "Alice Requester", "employee_id": "EMP001", "email": "requester@gmail.com", "phone": "9000000001", "role": "REQUESTER", "institution": "EEC", "department": "Computer Science and Engineering"},
    {"name": "Bob Manager", "employee_id": "EMP002", "email": "institution.manager@gmail.com", "phone": "9000000002", "role": "INSTITUTION_MANAGER", "institution": "EEC", "department": "Management Studies"},
    {"name": "Carol Accountant", "employee_id": "EMP003", "email": "accountant@gmail.com", "phone": "9000000003", "role": "ACCOUNTANT", "institution": "EEC", "department": "Management Studies"},
    {"name": "David HOI", "employee_id": "EMP004", "email": "hoi@gmail.com", "phone": "9000000004", "role": "HEAD_OF_INSTITUTION", "institution": "EEC", "department": "Management Studies"},
    {"name": "Eva MMA", "employee_id": "EMP005", "email": "mma@gmail.com", "phone": "9000000005", "role": "MMA", "institution": None, "department": "Management Studies"},
    {"name": "Frank HR Head", "employee_id": "EMP006", "email": "hrhead@gmail.com", "phone": "9000000006", "role": "HR_HEAD", "institution": None, "department": "Management Studies"},
    {"name": "Grace Data Management", "employee_id": "EMP007", "email": "datamgmt@gmail.com", "phone": "9000000007", "role": "MANAGER_DATA_MANAGEMENT", "institution": None, "department": "Information Technology"},
    {"name": "Henry Audit", "employee_id": "EMP008", "email": "audit@gmail.com", "phone": "9000000008", "role": "AUDIT", "institution": None, "department": "Management Studies"},
    {"name": "Isla Dean Admin", "employee_id": "EMP009", "email": "deanadmin@gmail.com", "phone": "9000000009", "role": "DEAN_ADMIN", "institution": None, "department": "Management Studies"},
    {"name": "Jack Chief Director", "employee_id": "EMP010", "email": "chiefdirector@gmail.com", "phone": "9000000010", "role": "CHIEF_DIRECTOR", "institution": None, "department": "Management Studies"},
    {"name": "Karen Chairman", "employee_id": "EMP011", "email": "chairman@gmail.com", "phone": "9000000011", "role": "CHAIRMAN", "institution": None, "department": "Management Studies"},
    {"name": "Leo Chairman Office", "employee_id": "EMP012", "email": "chairmanoffice@gmail.com", "phone": "9000000012", "role": "CHAIRMAN_OFFICE", "institution": None, "department": "Management Studies"},
    {"name": "Mia Manager Accounts", "employee_id": "EMP013", "email": "manageraccounts@gmail.com", "phone": "9000000013", "role": "MANAGER_ACCOUNTS", "institution": None, "department": "Management Studies"},
    {"name": "Nathan GM Finance", "employee_id": "EMP014", "email": "gmfinance@gmail.com", "phone": "9000000014", "role": "GM_FINANCE", "institution": None, "department": "Management Studies"},
    {"name": "Olivia Director Admissions", "employee_id": "EMP015", "email": "directoradmissions@gmail.com", "phone": "9000000015", "role": "DIRECTOR_ADMISSIONS", "institution": None, "department": "Management Studies"},
    {"name": "Paul Director Research", "employee_id": "EMP016", "email": "directorresearch@gmail.com", "phone": "9000000016", "role": "DIRECTOR_RESEARCH", "institution": None, "department": "Management Studies"},
]


async def seed() -> None:
    sessionmaker = get_sessionmaker()
    password_hash = hash_password(DEFAULT_PASSWORD)

    created = 0
    skipped = 0

    async with sessionmaker() as db:
        for user_data in SEED_USERS:
            exists = (
                await db.execute(
                    select(User.id).where(or_(User.employee_id == user_data["employee_id"], User.email == user_data["email"]))
                )
            ).scalar_one_or_none()

            if exists is not None:
                print(f"  SKIP  {user_data['role']:<24} - {user_data['employee_id']} already exists")
                skipped += 1
                continue

            db.add(User(password_hash=password_hash, **user_data))
            print(f"  OK    {user_data['role']:<24} - {user_data['email']}")
            created += 1

        await db.commit()

    print(f"\nDone. Created: {created}, Skipped: {skipped}")
    print(f"Default password for all new accounts: {DEFAULT_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(seed())
