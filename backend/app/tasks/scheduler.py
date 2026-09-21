"""APScheduler wiring — the FastAPI-era equivalent of server.js's
node-cron registrations, run in-process alongside the API (no
Celery/Redis needed for jobs this light and this infrequent).
"""

import logging

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from app.sops.index_service import sweep_pending_sops

from .overdue_worker import check_overdue_completions
from .sla_worker import update_request_working_hours_high_scale

logger = logging.getLogger("app.tasks.scheduler")

_scheduler: AsyncIOScheduler | None = None


def start_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is not None:
        return _scheduler

    scheduler = AsyncIOScheduler()

    # Fires exactly at minute :00 of every hour.
    scheduler.add_job(
        update_request_working_hours_high_scale,
        CronTrigger.from_crontab("0 * * * *"),
        id="sla_sweep",
        replace_existing=True,
    )
    logger.info("[scheduler] Hourly SLA monitoring scheduled.")

    # Expected-completion deadlines are date-only, so there's no benefit to
    # checking more often than once a day.
    scheduler.add_job(
        check_overdue_completions,
        CronTrigger.from_crontab("0 0 * * *"),
        id="overdue_sweep",
        replace_existing=True,
    )
    logger.info("[scheduler] Daily overdue completion monitoring scheduled.")

    # Re-enqueues SOPs stuck pending/processing, or migrating to a newly
    # configured EMBEDDING_MODEL.
    scheduler.add_job(
        sweep_pending_sops,
        CronTrigger.from_crontab("*/10 * * * *"),
        id="sop_sweep",
        replace_existing=True,
    )
    logger.info("[scheduler] SOP indexing sweep scheduled (every 10 min).")

    scheduler.start()
    _scheduler = scheduler
    return scheduler


def shutdown_scheduler() -> None:
    global _scheduler
    if _scheduler is not None:
        _scheduler.shutdown(wait=False)
        _scheduler = None
