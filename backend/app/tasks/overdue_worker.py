"""Daily overdue-completion worker. Direct port of
src/services/cronWorker.service.js's checkOverdueCompletions.

Finds completion records whose expected completion date has passed while
still marked not-completed, and emails the requester once per deadline.
`overdue_email_sent` is the guard against re-sending every day the record
stays overdue; it is cleared whenever expected_completion is changed (see
completed/service.py's update_expected_completion), so a pushed-out deadline
can trigger a fresh reminder if it lapses again.
"""

import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.completed.models import Completed
from app.db.base import get_sessionmaker
from app.email.service import send_overdue_completion_email
from app.requests.models import Request

logger = logging.getLogger("app.tasks.overdue")


async def check_overdue_completions(now: datetime | None = None, db: AsyncSession | None = None) -> None:
    now = now or datetime.now(timezone.utc)

    async def _run(session: AsyncSession) -> None:
        result = await session.execute(
            select(Completed)
            .where(
                Completed.completed_status.is_(False),
                Completed.overdue_email_sent.is_(False),
                Completed.expected_completion <= now.date(),
            )
            .options(selectinload(Completed.request).selectinload(Request.requester))
        )
        overdue = list(result.scalars().all())

        if not overdue:
            logger.info("[CRON WORKER] No overdue completions to notify.")
            return

        logger.info("[CRON WORKER] Sending overdue completion reminders for %d record(s)...", len(overdue))

        for completed in overdue:
            requester = completed.request.requester if completed.request else None
            if not requester or not requester.email:
                logger.warning("[OVERDUE COMPLETION] Skipping %s: no requester email found.", completed.id)
                continue

            try:
                await send_overdue_completion_email(
                    requester.email,
                    requester.name,
                    {
                        "completed_id": completed.id,
                        "request_id": completed.request.request_id if completed.request else None,
                        "title": completed.request.title if completed.request else None,
                        "expected_completion": completed.expected_completion,
                    },
                )
                completed.overdue_email_sent = True
                await session.commit()
                logger.info(
                    "[OVERDUE COMPLETION] Sent to %s for %s",
                    requester.email,
                    completed.request.request_id if completed.request else completed.id,
                )
            except Exception:
                logger.exception("[OVERDUE COMPLETION] Failed for %s", requester.email)
                await session.rollback()

    try:
        if db is not None:
            await _run(db)
        else:
            sessionmaker = get_sessionmaker()
            async with sessionmaker() as session:
                await _run(session)
    except Exception:
        logger.exception("[CRON WORKER] Overdue completion check failure")
