"""Daily billing jobs. Each job opens its own session and is safe to run repeatedly."""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from sqlalchemy import select, update

from app.database import SessionLocal
from app.enums import BillStatus, PlanStatus
from app.models import Bill, BillingPlan
from app.services import bill_sender, billing_engine

logger = logging.getLogger(__name__)


def generate_due_bills() -> int:
    """Generate (and auto-send) bills for every active plan that is due. Returns bills created.

    Commits per plan so one failing plan does not block the others.
    """
    today = datetime.now(UTC).date()
    created = 0
    with SessionLocal() as db:
        plan_ids = list(
            db.scalars(
                select(BillingPlan.id).where(
                    BillingPlan.status == PlanStatus.ACTIVE,
                    BillingPlan.next_billing_date <= today,
                )
            )
        )
    for plan_id in plan_ids:
        try:
            with SessionLocal() as db:
                plan = db.scalar(
                    select(BillingPlan).where(BillingPlan.id == plan_id).with_for_update()
                )
                if plan is None:
                    continue
                bills = billing_engine.generate_due_bills(db, plan, today)
                db.commit()
                created += len(bills)
                if plan.auto_send:
                    for bill in bills:
                        try:
                            bill_sender.send_bill(db, bill)
                        except Exception:
                            db.rollback()
                            logger.exception("Auto-send failed for bill id=%s", bill.id)
        except Exception:
            logger.exception("Bill generation failed for plan id=%s", plan_id)
    logger.info("generate_due_bills: %d bill(s) created", created)
    return created


def mark_overdue_bills() -> int:
    """Move sent / partially paid bills past their due date to ``overdue``."""
    today = datetime.now(UTC).date()
    with SessionLocal() as db:
        result = db.execute(
            update(Bill)
            .where(
                Bill.status.in_([BillStatus.SENT, BillStatus.PARTIALLY_PAID]),
                Bill.due_date < today,
            )
            .values(status=BillStatus.OVERDUE)
        )
        db.commit()
    count = int(result.rowcount or 0)  # type: ignore[attr-defined]
    logger.info("mark_overdue_bills: %d bill(s) marked overdue", count)
    return count
