"""Hourly SLA-tracking worker. Direct port of
src/services/cronWorker.service.js's updateRequestWorkingHoursHighScale +
findResponsibleUsers.

Only processes PENDING requests, only during business hours (9am-6pm,
Mon-Sat). SLA warning fires once on crossing the 7-hour mark; SLA breach at
8 hours creates one Flagged record (if none is already open) and notifies
every user responsible for the request's current stage.
"""

from app.users.constants import institutions_for, same_institution
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_sessionmaker
from app.email.service import send_sla_flagged_email, send_sla_warning_email
from app.flagged.models import Flagged, FlaggedUser
from app.requests.models import Request
from app.requests.workflow import INSTITUTION_SCOPED_STAGES, STAGE_ROLES
from app.users.models import User

logger = logging.getLogger("app.tasks.sla")

SLA_WARNING_HOURS = 7
SLA_BREACH_HOURS = 8


async def find_responsible_users(db: AsyncSession, request: Request) -> list[User]:
    """Every user who could handle `request` at its current stage.
    Institution-scoped stages filter by the request's institution; all
    other stages are global."""
    allowed_roles = STAGE_ROLES.get(request.stage, [])
    if not allowed_roles:
        logger.warning("[CRON WORKER] No roles defined for stage: %s", request.stage)
        return []

    stmt = select(User).where(User.role.in_(allowed_roles))
    if request.stage in INSTITUTION_SCOPED_STAGES:
        stmt = stmt.where(User.institution.in_(institutions_for(request.institution, request.stage)))

    try:
        result = await db.execute(stmt)
        return list(result.scalars().all())
    except Exception:
        logger.exception("[CRON WORKER] Error finding responsible users for stage %s", request.stage)
        return []


def _is_business_hours(now: datetime) -> bool:
    """9am-6pm, Monday-Saturday. Python's Monday=0..Sunday=6 is the mirror
    image of the source's JS getDay() (Sunday=0..Saturday=6); both exclude
    only Sunday, so `weekday() != 6` is the correct port of `currentDay !== 0`."""
    return 9 <= now.hour < 18 and now.weekday() != 6


async def _process_one_request(db: AsyncSession, request: Request, now: datetime) -> tuple[bool, bool]:
    """Returns (warned, flagged)."""
    hours_diff = (now - request.stage_arrived_at).total_seconds() / 3600
    previous_hours = float(request.working_hrs_taken or 0)
    request.working_hrs_taken = round(hours_diff, 2)

    warned = False
    flagged = False

    # SLA warning — 7-hour threshold, sent once on crossing.
    if SLA_WARNING_HOURS < request.working_hrs_taken <= SLA_BREACH_HOURS and previous_hours <= SLA_WARNING_HOURS:
        users = await find_responsible_users(db, request)
        if users:
            request_data = {
                "request_id": request.request_id,
                "title": request.title,
                "institution": request.institution,
                "department": request.department,
                "stage": request.stage,
                "working_hrs_taken": request.working_hrs_taken,
            }
            for user in users:
                try:
                    await send_sla_warning_email(user.email, user.name, request_data)
                except Exception:
                    logger.exception("[SLA WARNING] Failed for %s", user.email)
            warned = True

    # SLA breach — 8-hour threshold.
    if request.working_hrs_taken > SLA_BREACH_HOURS:
        already_flagged = (
            await db.execute(
                select(Flagged.id).where(Flagged.request_id == request.id, Flagged.flag_resolved.is_(False))
            )
        ).scalar_one_or_none()

        if already_flagged is None:
            users = await find_responsible_users(db, request)
            if users:
                flagged_row = Flagged(request_id=request.id, flagged_stage=request.stage, flag_resolved=False)
                db.add(flagged_row)
                await db.flush()
                for user in users:
                    db.add(FlaggedUser(flagged_id=flagged_row.id, user_id=user.id))

                request_data = {
                    "request_id": request.request_id,
                    "title": request.title,
                    "institution": request.institution,
                    "department": request.department,
                    "stage": request.stage,
                    "working_hrs_taken": request.working_hrs_taken,
                }
                for user in users:
                    try:
                        await send_sla_flagged_email(user.email, user.name, request_data)
                    except Exception:
                        logger.exception("[SLA FLAGGED] Failed for %s", user.email)
                flagged = True
                logger.info(
                    "[SLA BREACH] Request %s flagged. Hours: %s at stage: %s. Responsible users: %d.",
                    request.request_id,
                    request.working_hrs_taken,
                    request.stage,
                    len(users),
                )
            else:
                logger.warning(
                    "[SLA BREACH] Request %s exceeded SLA but no responsible users found for stage: %s",
                    request.request_id,
                    request.stage,
                )

    return warned, flagged


async def update_request_working_hours_high_scale(now: datetime | None = None, db: AsyncSession | None = None) -> None:
    """`now` and `db` are overridable for tests — a frozen clock to exercise
    the edge-triggered thresholds deterministically, and an injected session
    for the same reason index_sop_document takes one (see its docstring)."""
    now = now or datetime.now(timezone.utc)

    if not _is_business_hours(now):
        logger.info("[CRON WORKER] Outside business hours. Skipping.")
        return

    async def _run(session: AsyncSession) -> None:
        one_hour_ago = now - timedelta(hours=1)
        result = await session.execute(
            select(Request).where(Request.status == "PENDING", Request.stage_arrived_at <= one_hour_ago)
        )
        requests = list(result.scalars().all())

        if not requests:
            logger.info("[CRON WORKER] No pending requests to process.")
            return

        logger.info("[CRON WORKER] Processing %d pending requests...", len(requests))
        total_warnings = 0
        total_flagged = 0

        # Processed one at a time (not the source's per-200 Promise.all
        # batches) — an AsyncSession isn't safe to share across concurrent
        # coroutines, and per-item error isolation matters more here than
        # raw throughput at any scale this table will reach.
        for request in requests:
            try:
                warned, flagged = await _process_one_request(session, request, now)
                await session.commit()
                total_warnings += int(warned)
                total_flagged += int(flagged)
            except Exception:
                logger.exception("[CRON WORKER ERROR] Failed to process %s", request.request_id)
                await session.rollback()

        logger.info(
            "[CRON WORKER] Done. Processed: %d. Warnings: %d. Newly flagged: %d.",
            len(requests),
            total_warnings,
            total_flagged,
        )

    try:
        if db is not None:
            await _run(db)
        else:
            sessionmaker = get_sessionmaker()
            async with sessionmaker() as session:
                await _run(session)
    except Exception:
        logger.exception("[CRON WORKER] Scale Background Service Worker Failure")
