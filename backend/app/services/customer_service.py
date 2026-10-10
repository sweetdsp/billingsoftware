"""Customer business logic (Module 3).

Every query is scoped to the current user's ``user_id``; a customer belonging to another
tenant is indistinguishable from a missing one (404 ``customer_not_found``).

``balance_due`` = SUM(bill.total - bill.amount_paid) over the customer's bills whose status
is one of :data:`OUTSTANDING_BILL_STATUSES`.
"""

from __future__ import annotations

import logging
from decimal import Decimal

from sqlalchemy import ColumnElement, Select, func, or_, select, true
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.enums import BillStatus, PlanStatus
from app.exceptions import ConflictError, NotFoundError
from app.models import Bill, BillingPlan, Customer, Payment, User
from app.schemas.base import PageParams, quantize_money
from app.schemas.customer import (
    CustomerBillSummary,
    CustomerCreate,
    CustomerDetail,
    CustomerListItem,
    CustomerOut,
    CustomerPaymentSummary,
    CustomerPlanSummary,
    CustomerUpdate,
)
from app.services import billing_engine

logger = logging.getLogger(__name__)

OUTSTANDING_BILL_STATUSES: tuple[BillStatus, ...] = (
    BillStatus.SENT,
    BillStatus.PARTIALLY_PAID,
    BillStatus.OVERDUE,
)
"""Bill statuses that count towards a customer's balance due."""

BLOCKING_PLAN_STATUSES: tuple[PlanStatus, ...] = (PlanStatus.ACTIVE, PlanStatus.PAUSED)
"""Plan statuses that prevent archiving a customer."""

RECENT_LIMIT = 10
LIKE_ESCAPE_CHAR = "\\"
ZERO = Decimal("0.00")


# --------------------------------------------------------------------------- helpers


def escape_like(value: str) -> str:
    """Escape LIKE/ILIKE wildcards so user input matches literally (escape char ``\\``)."""
    return (
        value.replace(LIKE_ESCAPE_CHAR, LIKE_ESCAPE_CHAR * 2)
        .replace("%", LIKE_ESCAPE_CHAR + "%")
        .replace("_", LIKE_ESCAPE_CHAR + "_")
    )


def _search_clause(q: str) -> ColumnElement[bool]:
    pattern = f"%{escape_like(q)}%"
    return or_(
        Customer.name.ilike(pattern, escape=LIKE_ESCAPE_CHAR),
        Customer.email.ilike(pattern, escape=LIKE_ESCAPE_CHAR),
        Customer.company_name.ilike(pattern, escape=LIKE_ESCAPE_CHAR),
    )


def _list_filters(user: User, q: str | None, active: bool | None) -> list[ColumnElement[bool]]:
    filters: list[ColumnElement[bool]] = [Customer.user_id == user.id]
    if active is not None:
        filters.append(Customer.is_active == active)
    if q is not None and q.strip():
        filters.append(_search_clause(q.strip()))
    return filters


def _balance_subquery(user_id: int, customer_id: int | None = None) -> Select[int, Decimal]:
    """Grouped ``(customer_id, balance_due)`` over outstanding bills of one tenant."""
    stmt = select(
        Bill.customer_id,
        func.sum(Bill.total - Bill.amount_paid).label("balance_due"),
    ).where(Bill.user_id == user_id, Bill.status.in_(OUTSTANDING_BILL_STATUSES))
    if customer_id is not None:
        stmt = stmt.where(Bill.customer_id == customer_id)
    return stmt.group_by(Bill.customer_id)


def _active_plan_count_subquery(user_id: int) -> Select[int, int]:
    """Grouped ``(customer_id, active_plan_count)`` over active plans of one tenant."""
    return (
        select(
            BillingPlan.customer_id,
            func.count(BillingPlan.id).label("active_plan_count"),
        )
        .where(BillingPlan.user_id == user_id, BillingPlan.status == PlanStatus.ACTIVE)
        .group_by(BillingPlan.customer_id)
    )


def build_list_query(
    user: User, q: str | None, active: bool | None, params: PageParams
) -> Select[Customer, Decimal, int]:
    """One statement returning a page of customers with their aggregates (no N+1)."""
    balance = _balance_subquery(user.id).subquery("balance")
    plans = _active_plan_count_subquery(user.id).subquery("plans")
    return (
        select(
            Customer,
            func.coalesce(balance.c.balance_due, ZERO).label("balance_due"),
            func.coalesce(plans.c.active_plan_count, 0).label("active_plan_count"),
        )
        .outerjoin(balance, balance.c.customer_id == Customer.id)
        .outerjoin(plans, plans.c.customer_id == Customer.id)
        .where(*_list_filters(user, q, active))
        .order_by(func.lower(Customer.name), Customer.id)
        .offset(params.offset)
        .limit(params.limit)
    )


def _get_owned_customer(db: Session, user: User, customer_id: int) -> Customer:
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.user_id == user.id)
    )
    if customer is None:
        raise NotFoundError("Customer not found", code="customer_not_found")
    return customer


def _ensure_email_available(
    db: Session, user: User, email: str, exclude_id: int | None = None
) -> None:
    """409 if another ACTIVE customer of this user already uses ``email``."""
    stmt = select(Customer.id).where(
        Customer.user_id == user.id,
        Customer.is_active == true(),
        func.lower(Customer.email) == email.lower(),
    )
    if exclude_id is not None:
        stmt = stmt.where(Customer.id != exclude_id)
    if db.scalar(stmt.limit(1)) is not None:
        raise ConflictError(
            "An active customer with this email already exists", code="customer_email_exists"
        )


def _plan_total(plan: BillingPlan) -> Decimal:
    """Per-period plan total: sum of rounded line amounts + tax on the subtotal."""
    return billing_engine.compute_totals(plan.line_items, plan.tax_rate).total


# --------------------------------------------------------------------------- public API


def list_customers(
    db: Session,
    user: User,
    q: str | None,
    active: bool | None,
    params: PageParams,
) -> tuple[list[CustomerListItem], int]:
    """Return one page of the user's customers (with balance/plan aggregates) and the total.

    ``active=None`` returns both active and archived customers.
    """
    total = db.scalar(select(func.count(Customer.id)).where(*_list_filters(user, q, active)))
    rows = db.execute(build_list_query(user, q, active, params)).all()
    items = [
        CustomerListItem.model_validate(
            {
                **CustomerOut.model_validate(customer).model_dump(),
                "balance_due": quantize_money(Decimal(balance_due)),
                "active_plan_count": int(active_plan_count),
            }
        )
        for customer, balance_due, active_plan_count in rows
    ]
    return items, int(total or 0)


def get_customer(db: Session, user: User, customer_id: int) -> Customer:
    """Load one of the user's customers or raise 404 ``customer_not_found``."""
    return _get_owned_customer(db, user, customer_id)


def get_customer_detail(db: Session, user: User, customer_id: int) -> CustomerDetail:
    """Customer + balance due + all plans + latest 10 bills + latest 10 payments."""
    customer = _get_owned_customer(db, user, customer_id)

    balance_row = db.execute(_balance_subquery(user.id, customer.id)).first()
    balance_due = quantize_money(Decimal(balance_row.balance_due)) if balance_row else ZERO

    plans = db.scalars(
        select(BillingPlan)
        .options(selectinload(BillingPlan.line_items))
        .where(BillingPlan.user_id == user.id, BillingPlan.customer_id == customer.id)
        .order_by(BillingPlan.created_at.desc(), BillingPlan.id.desc())
    ).all()

    bill_rows = db.execute(
        select(
            Bill.id,
            Bill.bill_number,
            Bill.issue_date,
            Bill.due_date,
            Bill.total,
            Bill.amount_paid,
            Bill.status,
            Bill.currency,
        )
        .where(Bill.user_id == user.id, Bill.customer_id == customer.id)
        .order_by(Bill.issue_date.desc(), Bill.id.desc())
        .limit(RECENT_LIMIT)
    ).all()

    payment_rows = db.execute(
        select(
            Payment.id,
            Payment.bill_id,
            Payment.amount,
            Payment.currency,
            Payment.method,
            Payment.status,
            Payment.paid_at,
        )
        .join(Bill, Bill.id == Payment.bill_id)
        .where(
            Payment.user_id == user.id,
            Bill.user_id == user.id,
            Bill.customer_id == customer.id,
        )
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
        .limit(RECENT_LIMIT)
    ).all()

    return CustomerDetail.model_validate(
        {
            **CustomerOut.model_validate(customer).model_dump(),
            "balance_due": balance_due,
            "plans": [
                CustomerPlanSummary.model_validate(
                    {
                        "id": plan.id,
                        "name": plan.name,
                        "status": plan.status,
                        "frequency": plan.frequency,
                        "interval_count": plan.interval_count,
                        "next_billing_date": plan.next_billing_date,
                        "currency": plan.currency,
                        "total": _plan_total(plan),
                    }
                )
                for plan in plans
            ],
            "recent_bills": [CustomerBillSummary.model_validate(row) for row in bill_rows],
            "recent_payments": [CustomerPaymentSummary.model_validate(row) for row in payment_rows],
        }
    )


def _commit_or_conflict(db: Session) -> None:
    """Commit; map a race on ``uq_customers_user_id_lower_email_active`` to 409."""
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if "uq_customers_user_id_lower_email_active" in str(exc.orig):
            raise ConflictError(
                "An active customer with this email already exists",
                code="customer_email_exists",
            ) from exc
        raise


def create_customer(db: Session, user: User, data: CustomerCreate) -> Customer:
    """Create a customer. 409 ``customer_email_exists`` if an active one has the email."""
    _ensure_email_available(db, user, data.email)
    customer = Customer(user_id=user.id, is_active=True, **data.model_dump())
    db.add(customer)
    _commit_or_conflict(db)
    db.refresh(customer)
    logger.info("Created customer id=%s for user id=%s", customer.id, user.id)
    return customer


def update_customer(db: Session, user: User, customer_id: int, data: CustomerUpdate) -> Customer:
    """Partially update a customer (only fields sent). Same duplicate-email rule as create."""
    customer = _get_owned_customer(db, user, customer_id)
    changes = data.model_dump(exclude_unset=True)

    new_email = changes.get("email", customer.email)
    will_be_active = changes.get("is_active", customer.is_active)
    email_changed = "email" in changes and new_email != (customer.email or "").lower()
    reactivating = will_be_active and not customer.is_active
    if will_be_active and new_email and (email_changed or reactivating):
        _ensure_email_available(db, user, new_email, exclude_id=customer.id)

    for field, value in changes.items():
        setattr(customer, field, value)
    _commit_or_conflict(db)
    db.refresh(customer)
    return customer


def archive_customer(db: Session, user: User, customer_id: int) -> None:
    """Soft-delete (``is_active=False``). 409 ``customer_has_active_plans`` if any plan is
    active or paused. Customers are never hard-deleted. Archiving twice is a no-op."""
    customer = _get_owned_customer(db, user, customer_id)
    blocking_plan = db.scalar(
        select(BillingPlan.id)
        .where(
            BillingPlan.user_id == user.id,
            BillingPlan.customer_id == customer.id,
            BillingPlan.status.in_(BLOCKING_PLAN_STATUSES),
        )
        .limit(1)
    )
    if blocking_plan is not None:
        raise ConflictError(
            "Cancel this customer's active or paused billing plans before archiving",
            code="customer_has_active_plans",
        )
    if customer.is_active:
        customer.is_active = False
        db.commit()
        logger.info("Archived customer id=%s for user id=%s", customer.id, user.id)
