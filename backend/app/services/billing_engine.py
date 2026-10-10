"""Billing engine: money math, schedule math, bill numbering and bill generation.

This is the single source of truth for every amount and date that ends up on a bill.

Money rules
    * Everything is :class:`~decimal.Decimal`; ``float`` is rejected outright.
    * ``amount = quantize(quantity * unit_price)`` per line (``ROUND_HALF_UP`` to 0.01).
    * ``subtotal = sum(amounts)``; ``tax = quantize(subtotal * tax_rate / 100)``;
      ``total = subtotal + tax``. Tax is computed once on the subtotal, never per line.

Schedule rules
    * Weekly plans advance by ``7 * interval`` days.
    * Monthly / quarterly / yearly plans advance by ``months * interval`` using
      ``relativedelta`` and are then re-anchored to the plan's ``anchor_day``
      (``start_date.day``) clamped to the target month's last day, so a plan that starts on
      Jan 31 bills Feb 28 (29 in leap years) and then Mar 31 again - it never drifts.

Bill status rules (:func:`recalc_bill_status`)
    * ``amount_paid`` = sum of *succeeded* payments.
    * ``cancelled`` is terminal (only ``amount_paid`` is refreshed).
    * Fully paid -> ``paid``. Otherwise, a bill that has left ``draft`` (or has received
      money) is ``overdue`` when ``today > due_date`` - **even if partially paid** - else
      ``partially_paid`` (some money) or ``sent`` (no money). This matches the scheduler's
      ``mark_overdue_bills`` job, which moves past-due ``partially_paid`` bills to ``overdue``.
"""

from __future__ import annotations

import calendar
import logging
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from decimal import ROUND_HALF_UP, Decimal
from typing import Protocol

from dateutil.relativedelta import relativedelta
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums import BillingFrequency, BillStatus, PaymentStatus, PlanStatus
from app.exceptions import ConflictError
from app.models import Bill, BillingPlan, BillLineItem, BusinessProfile

logger = logging.getLogger(__name__)

TWO_PLACES = Decimal("0.01")
ZERO = Decimal("0.00")
HUNDRED = Decimal(100)

MONTHS_PER_PERIOD: dict[BillingFrequency, int] = {
    BillingFrequency.MONTHLY: 1,
    BillingFrequency.QUARTERLY: 3,
    BillingFrequency.YEARLY: 12,
}
"""Calendar months in one period for every month-based frequency (weekly is day-based)."""

DAYS_PER_WEEK = 7
MAX_CATCH_UP_PERIODS = 1000
"""Defensive cap on periods generated for one plan in a single :func:`generate_due_bills`."""

PLAN_PERIOD_UNIQUE_CONSTRAINT = "uq_bills_plan_id_period_start"
"""Name of ``UNIQUE(plan_id, period_start)`` on ``bills`` (naming convention in database.py)."""


# --------------------------------------------------------------------------- money


@dataclass(frozen=True)
class LineAmount:
    """A computed bill/plan line."""

    description: str
    quantity: Decimal
    unit_price: Decimal
    amount: Decimal


@dataclass(frozen=True)
class Totals:
    """Computed lines and totals for a set of line items."""

    lines: list[LineAmount]
    subtotal: Decimal
    tax_amount: Decimal
    total: Decimal


class LineItemLike(Protocol):
    """Anything with ``description``, ``quantity`` and ``unit_price`` (ORM row or schema)."""

    @property
    def description(self) -> str: ...

    @property
    def quantity(self) -> Decimal: ...

    @property
    def unit_price(self) -> Decimal: ...


def _as_decimal(value: Decimal | int) -> Decimal:
    """Coerce to Decimal, refusing floats (binary floating point must never touch money)."""
    if isinstance(value, float):
        raise TypeError("float is not allowed for money; use Decimal")
    return Decimal(value)


def quantize(value: Decimal) -> Decimal:
    """Round to 2 decimal places using ``ROUND_HALF_UP``."""
    return _as_decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def compute_totals(items: Sequence[LineItemLike], tax_rate: Decimal) -> Totals:
    """Compute per-line amounts, subtotal, tax (on the subtotal) and total.

    ``amount = quantize(quantity * unit_price)``; ``subtotal = sum(amounts)``;
    ``tax_amount = quantize(subtotal * tax_rate / 100)``; ``total = subtotal + tax_amount``.
    """
    rate = _as_decimal(tax_rate)
    lines: list[LineAmount] = []
    for item in items:
        quantity = _as_decimal(item.quantity)
        unit_price = _as_decimal(item.unit_price)
        lines.append(
            LineAmount(
                description=item.description,
                quantity=quantity,
                unit_price=unit_price,
                amount=quantize(quantity * unit_price),
            )
        )
    subtotal = quantize(sum((line.amount for line in lines), ZERO))
    tax_amount = quantize(subtotal * rate / HUNDRED)
    return Totals(
        lines=lines,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=quantize(subtotal + tax_amount),
    )


# --------------------------------------------------------------------------- schedule


def anchor_day_for(plan: BillingPlan) -> int:
    """Day of month every month-based period re-anchors to (the plan's ``start_date.day``)."""
    return plan.start_date.day


def advance(d: date, frequency: BillingFrequency, interval: int, anchor_day: int) -> date:
    """Return the billing date one period (``interval`` units of ``frequency``) after ``d``.

    Month-based frequencies re-anchor to ``anchor_day`` clamped to the target month's length:
    Jan 31 -> Feb 28/29 -> Mar 31; Aug 31 (quarterly) -> Nov 30 -> Feb 28/29 -> May 31.
    """
    if interval < 1:
        raise ValueError("interval must be >= 1")
    if frequency == BillingFrequency.WEEKLY:
        return d + timedelta(days=DAYS_PER_WEEK * interval)
    target = d + relativedelta(months=MONTHS_PER_PERIOD[frequency] * interval)
    last_day = calendar.monthrange(target.year, target.month)[1]
    return target.replace(day=min(anchor_day, last_day))


def _advance_plan_date(plan: BillingPlan, d: date) -> date:
    return advance(d, plan.frequency, plan.interval_count, anchor_day_for(plan))


def period_end_for(period_start: date, plan: BillingPlan) -> date:
    """Last day (inclusive) of the period starting on ``period_start``."""
    return _advance_plan_date(plan, period_start) - timedelta(days=1)


def preview_schedule(plan: BillingPlan, count: int = 6) -> list[date]:
    """The next ``count`` billing dates from ``next_billing_date``, stopping at ``end_date``.

    A cancelled plan has no upcoming dates.
    """
    if plan.status == PlanStatus.CANCELLED:
        return []
    dates: list[date] = []
    current = plan.next_billing_date
    while len(dates) < count and (plan.end_date is None or current <= plan.end_date):
        dates.append(current)
        current = _advance_plan_date(plan, current)
    return dates


# --------------------------------------------------------------------------- numbering


def allocate_bill_number(db: Session, user_id: int) -> str:
    """Allocate the user's next bill number (``{prefix}{n:05d}``) under a row lock.

    Locks the business profile row (``SELECT ... FOR UPDATE``) so concurrent allocations are
    serialized, then increments ``next_bill_number`` and flushes. The caller's transaction
    (or savepoint) decides whether the number is kept.

    Raises:
        ConflictError(code="profile_required"): the user has no business profile yet.
    """
    profile = db.scalar(
        select(BusinessProfile)
        .where(BusinessProfile.user_id == user_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if profile is None:
        raise ConflictError(
            "Set up your business profile before generating bills", code="profile_required"
        )
    number = f"{profile.bill_number_prefix}{profile.next_bill_number:05d}"
    profile.next_bill_number += 1
    db.flush()
    return number


# --------------------------------------------------------------------------- generation


def _is_duplicate_period(exc: IntegrityError) -> bool:
    return PLAN_PERIOD_UNIQUE_CONSTRAINT in str(exc.orig)


def generate_bill_for_period(
    db: Session, plan: BillingPlan, period_start: date, *, today: date | None = None
) -> Bill | None:
    """Create a draft bill for ``plan``'s period starting ``period_start``.

    Line items are snapshotted from the plan; totals use :func:`compute_totals` with the
    plan's tax rate; ``issue_date = today`` and ``due_date = issue_date + plan.due_days``.

    Everything (including bill-number allocation) runs inside a SAVEPOINT. If a bill for
    ``(plan_id, period_start)`` already exists the savepoint is rolled back - so no bill
    number is consumed - and ``None`` is returned (idempotent). Does not commit.

    Raises:
        ConflictError(code="profile_required"): the user has no business profile.
        IntegrityError: any constraint violation other than the duplicate period.
    """
    issue_date = today if today is not None else date.today()
    totals = compute_totals(plan.line_items, plan.tax_rate)
    try:
        with db.begin_nested():
            bill = Bill(
                user_id=plan.user_id,
                customer_id=plan.customer_id,
                plan_id=plan.id,
                bill_number=allocate_bill_number(db, plan.user_id),
                issue_date=issue_date,
                due_date=issue_date + timedelta(days=plan.due_days),
                period_start=period_start,
                period_end=period_end_for(period_start, plan),
                currency=plan.currency,
                subtotal=totals.subtotal,
                tax_rate=plan.tax_rate,
                tax_amount=totals.tax_amount,
                total=totals.total,
                amount_paid=ZERO,
                status=BillStatus.DRAFT,
                line_items=[
                    BillLineItem(
                        description=line.description,
                        quantity=line.quantity,
                        unit_price=line.unit_price,
                        amount=line.amount,
                        position=source.position,
                    )
                    for source, line in zip(plan.line_items, totals.lines, strict=True)
                ],
            )
            db.add(bill)
            db.flush()
    except IntegrityError as exc:
        if not _is_duplicate_period(exc):
            raise
        logger.info(
            "Bill for plan id=%s period_start=%s already exists; skipped", plan.id, period_start
        )
        return None
    logger.info(
        "Generated bill id=%s (%s) for plan id=%s period_start=%s",
        bill.id,
        bill.bill_number,
        plan.id,
        period_start,
    )
    return bill


def generate_due_bills(db: Session, plan: BillingPlan, today: date) -> list[Bill]:
    """Generate every due (including missed) period of an active plan and advance it.

    Loops while ``next_billing_date <= today`` and within ``end_date``. A period that already
    has a bill is skipped (but the plan still advances). Plans that are not ``active`` are
    left untouched. Does not commit and does not send emails.
    """
    if plan.status != PlanStatus.ACTIVE:
        return []
    created: list[Bill] = []
    for _ in range(MAX_CATCH_UP_PERIODS):
        period_start = plan.next_billing_date
        if period_start > today or (plan.end_date is not None and period_start > plan.end_date):
            break
        bill = generate_bill_for_period(db, plan, period_start, today=today)
        if bill is not None:
            created.append(bill)
        plan.next_billing_date = _advance_plan_date(plan, period_start)
    else:
        logger.warning(
            "Plan id=%s hit the catch-up cap of %s periods", plan.id, MAX_CATCH_UP_PERIODS
        )
    return created


# --------------------------------------------------------------------------- status


def recalc_bill_status(bill: Bill, today: date) -> None:
    """Recompute ``amount_paid`` and ``status`` (and ``paid_at``) from the bill's payments.

    Callers must make sure ``bill.payments`` is current (append new payments through the
    relationship, or ``db.refresh(bill, ["payments"])``). Does not flush or commit.

    * ``cancelled``: terminal - only ``amount_paid`` is refreshed.
    * fully paid (``amount_paid >= total``; a zero-total bill only once it left ``draft``):
      ``paid`` and ``paid_at`` set if unset.
    * otherwise ``paid_at`` is cleared, and if the bill has left ``draft`` or received money:
      ``overdue`` when ``today > due_date`` (even if partially paid), else ``partially_paid``
      when some money was received, else ``sent``.
    * an unpaid ``draft`` stays ``draft``.
    """
    bill.amount_paid = quantize(
        sum(
            (
                _as_decimal(payment.amount)
                for payment in bill.payments
                if payment.status == PaymentStatus.SUCCEEDED
            ),
            ZERO,
        )
    )
    if bill.status == BillStatus.CANCELLED:
        return

    total = _as_decimal(bill.total)
    fully_paid = bill.amount_paid >= total and (total > 0 or bill.status != BillStatus.DRAFT)
    if fully_paid:
        bill.status = BillStatus.PAID
        if bill.paid_at is None:
            bill.paid_at = datetime.now(UTC)
        return

    bill.paid_at = None
    if bill.status == BillStatus.DRAFT and bill.amount_paid == 0:
        return
    if today > bill.due_date:
        bill.status = BillStatus.OVERDUE
    elif bill.amount_paid > 0:
        bill.status = BillStatus.PARTIALLY_PAID
    else:
        bill.status = BillStatus.SENT
