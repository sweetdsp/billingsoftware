"""Dashboard analytics (Module 7), computed with SQL aggregates.

Every query is scoped to the current user's ``user_id``. Money figures are reported in the
business profile's ``default_currency`` (``"USD"`` before onboarding); rows in any other
currency are excluded from the sums and their currency codes are reported separately.

Definitions
-----------
- **Plan total** (per period): ``SUM(round(quantity * unit_price, 2))`` over the plan's line
  items, plus ``round(subtotal * tax_rate / 100, 2)`` - identical to
  ``billing_engine.compute_totals``. Postgres ``round(numeric, 2)`` rounds half away from zero,
  which equals ``ROUND_HALF_UP`` for the non-negative amounts we store.
- **MRR**: sum over active plans of the plan total normalized to a month (weekly x 52/12,
  monthly x 1, quarterly / 3, yearly / 12, all / ``interval_count``), rounded once at the end.
- **Outstanding**: ``SUM(total - amount_paid)`` over bills in sent / partially_paid / overdue.
- **Overdue**: bills in ``overdue``, plus ``partially_paid`` bills whose due date has passed.
- **Collected**: succeeded payments (failed / refunded never count), bucketed by ``paid_at``
  in UTC.

"Today" comes from :func:`_today` (UTC) so tests can freeze time.
"""

from __future__ import annotations

from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import (
    ColumnElement,
    Select,
    String,
    Subquery,
    and_,
    case,
    extract,
    func,
    literal_column,
    or_,
    select,
    union,
)
from sqlalchemy.orm import Session

from app.enums import BillingFrequency, BillStatus, PaymentStatus, PlanStatus
from app.models import Bill, BillingPlan, Customer, Payment, PlanLineItem, User
from app.schemas.analytics import (
    AgingBucket,
    AgingLabel,
    AgingReport,
    AnalyticsSummary,
    RevenuePoint,
    TopCustomer,
    UpcomingBill,
)
from app.schemas.base import quantize_money
from app.services.business_profile_service import find_profile

DEFAULT_CURRENCY = "USD"
ZERO = Decimal("0")

OUTSTANDING_BILL_STATUSES: tuple[BillStatus, ...] = (
    BillStatus.SENT,
    BillStatus.PARTIALLY_PAID,
    BillStatus.OVERDUE,
)
"""Bill statuses whose unpaid balance counts as outstanding."""

NOT_BILLED_STATUSES: tuple[BillStatus, ...] = (BillStatus.DRAFT, BillStatus.CANCELLED)
"""Bill statuses that never count as revenue billed."""

UPCOMING_WINDOW_DAYS = 7
UPCOMING_LIMIT = 10
TOP_CUSTOMERS_WINDOW_MONTHS = 12

AGING_BUCKETS: tuple[tuple[AgingLabel, int, int | None], ...] = (
    ("0-30", 1, 30),
    ("31-60", 31, 60),
    ("61-90", 61, 90),
    ("90+", 91, None),
)
"""``(label, min_days_past_due, max_days_past_due)`` - inclusive bounds."""

_UTC: ColumnElement[str] = literal_column("'UTC'", String)


# --------------------------------------------------------------------------- time helpers


def _today() -> date:
    """Current UTC date (single seam for freezing time in tests)."""
    return datetime.now(UTC).date()


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _add_months(d: date, months: int) -> date:
    """Shift ``d`` by ``months`` calendar months, clamping the day to the target month."""
    index = d.year * 12 + (d.month - 1) + months
    year, month0 = divmod(index, 12)
    month = month0 + 1
    next_month_first = date(year + (month == 12), month % 12 + 1, 1)
    last_day = (next_month_first - timedelta(days=1)).day
    return date(year, month, min(d.day, last_day))


def _utc_midnight(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=UTC)


def _money(value: Decimal | None) -> Decimal:
    return quantize_money(Decimal(value) if value is not None else ZERO)


# --------------------------------------------------------------------------- query builders


def reporting_currency(db: Session, user: User) -> str:
    """The business profile's default currency, or ``"USD"`` if there is no profile yet."""
    profile = find_profile(db, user.id)
    return profile.default_currency if profile is not None else DEFAULT_CURRENCY


def plan_totals_subquery(user_id: int) -> Subquery:
    """Active plans of one tenant with their per-period ``total`` computed in SQL."""
    subtotal = func.coalesce(
        func.sum(func.round(PlanLineItem.quantity * PlanLineItem.unit_price, 2)), ZERO
    )
    total = subtotal + func.round(subtotal * BillingPlan.tax_rate / 100, 2)
    return (
        select(
            BillingPlan.id.label("plan_id"),
            BillingPlan.name.label("plan_name"),
            BillingPlan.customer_id,
            BillingPlan.currency,
            BillingPlan.frequency,
            BillingPlan.interval_count,
            BillingPlan.next_billing_date,
            total.label("total"),
        )
        .outerjoin(PlanLineItem, PlanLineItem.plan_id == BillingPlan.id)
        .where(BillingPlan.user_id == user_id, BillingPlan.status == PlanStatus.ACTIVE)
        .group_by(BillingPlan.id)
        .subquery("plan_totals")
    )


def monthly_amount(plans: Subquery) -> ColumnElement[Decimal]:
    """Plan total normalized to one month (multiply before dividing to keep precision)."""
    total = plans.c.total
    interval = plans.c.interval_count
    return case(
        (plans.c.frequency == BillingFrequency.WEEKLY, total * 52 / (12 * interval)),
        (plans.c.frequency == BillingFrequency.MONTHLY, total / interval),
        (plans.c.frequency == BillingFrequency.QUARTERLY, total / (3 * interval)),
        else_=total / (12 * interval),
    )


def mrr_query(user_id: int, currency: str) -> Select[int, Decimal]:
    """One aggregate: ``(active_plan_count, mrr_unrounded)`` for the tenant."""
    plans = plan_totals_subquery(user_id)
    return select(
        func.count(plans.c.plan_id).label("active_plans"),
        func.coalesce(
            func.sum(monthly_amount(plans)).filter(plans.c.currency == currency), ZERO
        ).label("mrr"),
    )


def _overdue_condition(today: date) -> ColumnElement[bool]:
    return or_(
        Bill.status == BillStatus.OVERDUE,
        and_(Bill.status == BillStatus.PARTIALLY_PAID, Bill.due_date < today),
    )


def _excluded_currencies(db: Session, user_id: int, currency: str, month: date) -> list[str]:
    """Currencies (other than ``currency``) present in the data behind the summary figures."""
    month_from = _utc_midnight(month)
    month_to = _utc_midnight(_add_months(month, 1))
    stmt = union(
        select(BillingPlan.currency).where(
            BillingPlan.user_id == user_id,
            BillingPlan.status == PlanStatus.ACTIVE,
            BillingPlan.currency != currency,
        ),
        select(Bill.currency).where(
            Bill.user_id == user_id,
            Bill.status.in_(OUTSTANDING_BILL_STATUSES),
            Bill.currency != currency,
        ),
        select(Payment.currency).where(
            Payment.user_id == user_id,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.paid_at >= month_from,
            Payment.paid_at < month_to,
            Payment.currency != currency,
        ),
    )
    return sorted({str(code) for code in db.scalars(stmt)})


# --------------------------------------------------------------------------- public API


def get_summary(db: Session, user: User) -> AnalyticsSummary:
    """Headline dashboard figures for the current user."""
    today = _today()
    currency = reporting_currency(db, user)
    month = _month_start(today)

    plan_row = db.execute(mrr_query(user.id, currency)).one()

    bill_row = db.execute(
        select(
            func.coalesce(func.sum(Bill.total - Bill.amount_paid), ZERO).label("outstanding"),
            func.coalesce(
                func.sum(Bill.total - Bill.amount_paid).filter(_overdue_condition(today)), ZERO
            ).label("overdue_amount"),
            func.count(Bill.id).filter(_overdue_condition(today)).label("overdue_count"),
        ).where(
            Bill.user_id == user.id,
            Bill.currency == currency,
            Bill.status.in_(OUTSTANDING_BILL_STATUSES),
        )
    ).one()

    collected = db.scalar(
        select(func.coalesce(func.sum(Payment.amount), ZERO)).where(
            Payment.user_id == user.id,
            Payment.currency == currency,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.paid_at >= _utc_midnight(month),
            Payment.paid_at < _utc_midnight(_add_months(month, 1)),
        )
    )

    active_customers = db.scalar(
        select(func.count(Customer.id)).where(
            Customer.user_id == user.id, Customer.is_active.is_(True)
        )
    )

    plans = plan_totals_subquery(user.id)
    upcoming_rows = db.execute(
        select(plans, Customer.name.label("customer_name"))
        .join(Customer, Customer.id == plans.c.customer_id)
        .where(
            plans.c.next_billing_date >= today,
            plans.c.next_billing_date <= today + timedelta(days=UPCOMING_WINDOW_DAYS),
        )
        .order_by(plans.c.next_billing_date, plans.c.plan_id)
        .limit(UPCOMING_LIMIT)
    ).all()

    return AnalyticsSummary(
        currency=currency,
        mrr=_money(plan_row.mrr),
        collected_this_month=_money(collected),
        outstanding=_money(bill_row.outstanding),
        overdue_amount=_money(bill_row.overdue_amount),
        overdue_count=int(bill_row.overdue_count or 0),
        active_plans=int(plan_row.active_plans or 0),
        active_customers=int(active_customers or 0),
        upcoming_bills=[
            UpcomingBill(
                plan_id=row.plan_id,
                plan_name=row.plan_name,
                customer_id=row.customer_id,
                customer_name=row.customer_name,
                next_billing_date=row.next_billing_date,
                total=_money(row.total),
                currency=row.currency,
            )
            for row in upcoming_rows
        ],
        excluded_currencies=_excluded_currencies(db, user.id, currency, month),
    )


def get_revenue(db: Session, user: User, months: int) -> list[RevenuePoint]:
    """Billed vs collected per calendar month for the last ``months`` months (zero-filled)."""
    currency = reporting_currency(db, user)
    current = _month_start(_today())
    start = _add_months(current, -(months - 1))
    end = _add_months(current, 1)

    billed_rows = db.execute(
        select(
            extract("year", Bill.issue_date).label("y"),
            extract("month", Bill.issue_date).label("m"),
            func.sum(Bill.total).label("amount"),
        )
        .where(
            Bill.user_id == user.id,
            Bill.currency == currency,
            Bill.status.not_in(NOT_BILLED_STATUSES),
            Bill.issue_date >= start,
            Bill.issue_date < end,
        )
        .group_by(extract("year", Bill.issue_date), extract("month", Bill.issue_date))
    ).all()

    paid_at_utc = Payment.paid_at.op("AT TIME ZONE")(_UTC)
    collected_rows = db.execute(
        select(
            extract("year", paid_at_utc).label("y"),
            extract("month", paid_at_utc).label("m"),
            func.sum(Payment.amount).label("amount"),
        )
        .where(
            Payment.user_id == user.id,
            Payment.currency == currency,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.paid_at >= _utc_midnight(start),
            Payment.paid_at < _utc_midnight(end),
        )
        .group_by(extract("year", paid_at_utc), extract("month", paid_at_utc))
    ).all()

    billed = {(int(r.y), int(r.m)): Decimal(r.amount) for r in billed_rows}
    collected = {(int(r.y), int(r.m)): Decimal(r.amount) for r in collected_rows}

    points: list[RevenuePoint] = []
    for offset in range(months):
        m = _add_months(start, offset)
        key = (m.year, m.month)
        points.append(
            RevenuePoint(
                month=f"{m.year:04d}-{m.month:02d}",
                billed=_money(billed.get(key)),
                collected=_money(collected.get(key)),
            )
        )
    return points


def get_aging(db: Session, user: User) -> AgingReport:
    """Unpaid balance of past-due open bills, bucketed by days past due (one aggregate)."""
    today = _today()
    currency = reporting_currency(db, user)
    balance = Bill.total - Bill.amount_paid

    columns: list[ColumnElement[Decimal] | ColumnElement[int]] = []
    for label, min_days, max_days in AGING_BUCKETS:
        # days_past_due = today - due_date  =>  min <= days <= max
        conds = [Bill.due_date <= today - timedelta(days=min_days)]
        if max_days is not None:
            conds.append(Bill.due_date >= today - timedelta(days=max_days))
        in_bucket = and_(*conds)
        columns.append(func.coalesce(func.sum(balance).filter(in_bucket), ZERO).label(label))
        columns.append(func.count(Bill.id).filter(in_bucket).label(f"{label}_count"))

    row = db.execute(
        select(*columns).where(
            Bill.user_id == user.id,
            Bill.currency == currency,
            Bill.status.in_(OUTSTANDING_BILL_STATUSES),
            Bill.due_date < today,
        )
    ).one()
    values = row._mapping
    return AgingReport(
        currency=currency,
        buckets=[
            AgingBucket(
                label=label,
                amount=_money(values[label]),
                count=int(values[f"{label}_count"] or 0),
            )
            for label, _, _ in AGING_BUCKETS
        ],
    )


def get_top_customers(db: Session, user: User, limit: int) -> list[TopCustomer]:
    """Customers ranked by succeeded payments collected in the last 12 months."""
    currency = reporting_currency(db, user)
    since = _utc_midnight(_add_months(_today(), -TOP_CUSTOMERS_WINDOW_MONTHS))
    collected = func.sum(Payment.amount)
    rows = db.execute(
        select(Customer.id, Customer.name, collected.label("collected"))
        .join(Bill, Bill.id == Payment.bill_id)
        .join(Customer, Customer.id == Bill.customer_id)
        .where(
            Payment.user_id == user.id,
            Customer.user_id == user.id,
            Payment.currency == currency,
            Payment.status == PaymentStatus.SUCCEEDED,
            Payment.paid_at >= since,
        )
        .group_by(Customer.id, Customer.name)
        .order_by(collected.desc(), Customer.name, Customer.id)
        .limit(limit)
    ).all()
    return [
        TopCustomer(customer_id=r.id, customer_name=r.name, collected=_money(r.collected))
        for r in rows
    ]
