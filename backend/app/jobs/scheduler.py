"""APScheduler factory.

Returns a ``BackgroundScheduler`` with the daily jobs registered:
``generate_due_bills`` and ``mark_overdue_bills`` at ``settings.SCHEDULER_CRON_HOUR`` UTC
(each job opens its own DB session).
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from app.config import settings
from app.jobs import billing_jobs

logger = logging.getLogger(__name__)


def create_scheduler() -> BackgroundScheduler:
    """Build the background scheduler (UTC)."""
    scheduler = BackgroundScheduler(
        timezone="UTC",
        job_defaults={"coalesce": True, "max_instances": 1, "misfire_grace_time": 3600},
    )
    trigger = CronTrigger(hour=settings.SCHEDULER_CRON_HOUR, minute=0, timezone="UTC")
    scheduler.add_job(
        billing_jobs.generate_due_bills, trigger, id="generate_due_bills", replace_existing=True
    )
    scheduler.add_job(
        billing_jobs.mark_overdue_bills, trigger, id="mark_overdue_bills", replace_existing=True
    )
    logger.debug("Scheduler created with %d job(s)", len(scheduler.get_jobs()))
    return scheduler
