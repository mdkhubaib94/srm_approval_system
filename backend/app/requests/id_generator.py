"""Human-readable request/indent id generation. Port of requestController.js's
generateRequestID / generateIndentNumber."""

import random

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.requests.models import Request
from .workflow import DEPARTMENT_SHORTFORMS, INSTITUTION_SHORTFORMS

MAX_ATTEMPTS = 100


def _shortform_for(mapping: dict[str, str], key: str | None) -> str:
    if isinstance(key, str) and key in mapping:
        return mapping[key]
    return "UNK"


async def generate_request_id(db: AsyncSession, institution: str, department: str) -> str:
    institution_short = _shortform_for(INSTITUTION_SHORTFORMS, institution)
    department_short = _shortform_for(DEPARTMENT_SHORTFORMS, department)

    for _ in range(MAX_ATTEMPTS):
        random_num = random.randint(100, 999)
        request_id = f"{institution_short}{department_short}{random_num}"
        existing = await db.execute(select(Request.id).where(Request.request_id == request_id))
        if existing.scalar_one_or_none() is None:
            return request_id

    import time

    timestamp = str(int(time.time() * 1000))[-4:]
    return f"{institution_short}{department_short}{timestamp}"


def generate_indent_number(institution: str, department: str) -> str:
    """Same prefix scheme as the request ID, with "IN" inserted before the
    random number (e.g. EEC + SE + IN + 875 -> "EECSEIN875")."""
    institution_short = _shortform_for(INSTITUTION_SHORTFORMS, institution)
    department_short = _shortform_for(DEPARTMENT_SHORTFORMS, department)
    random_num = random.randint(100, 999)
    return f"{institution_short}{department_short}IN{random_num}"
