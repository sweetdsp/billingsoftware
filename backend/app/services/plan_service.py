"""Billing plan business logic (Module 4).

Every query is scoped to the current user's ``user_id``; a plan belonging to another tenant
is indistinguishable from a missing one (404 ``plan_not_found``).

Lifecycle: ``active <-> paused``, ``active|paused -> cancelled`` (terminal). Editing a plan
only affects future bills - already generated bills are never touched.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from datetime import date
from decimal import Decimal
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app.enums import PlanStatus
from app.exceptions import AppError, BadRequestError, ConflictError, NotFoundError
from app.models import Bill, BillingPlan, BusinessProfile, Customer, PlanLineItem, User
from app.schemas.base import PageParams
from app.schemas.billing_plan import (
    BillingPlanCreate,
    BillingPlanDetail,
    BillingPlanListItem,
    BillingPlanOut,
    BillingPlanUpdate,
    PlanBillSummary,
    PlanLineItemIn,
    PlanLineItemOut,
)
from app.services import billing_engine, customer_service

logger = logging.getLogger(__name__)

DEFAULT_CURRENCY = "USD"
DEFAULT_DUE_DAYS = 7
DEFAULT_TAX_RATE = Decimal("0")
MAX_PLAN_TOTAL = Decimal("9999999999.99")
"""Largest total a bill can store (``Numeric(12, 2)``)."""
UPCOMING_COUNT = 6
RECENT_BILLS_LIMIT = 10


class PlanValidationError(AppError):
    """422 - the payload is well-formed but inconsistent with the stored plan."""

    status_code = 422
    code = "invalid_plan"
    default_detail = "Invalid billing plan"


# --------------------------------------------------------------------------- helpers


def _get_owned_plan(db: Session, user: User, plan_id: int, *, lock: bool = False) -> BillingPlan:
    stmt = (
        select(BillingPlan)
        .options(selectinload(BillingPlan.line_items))
        .where(BillingPlan.id == plan_id, BillingPlan.user_id == user.id)
    )
    if lock:
        stmt = stmt.with_for_update(of=BillingPlan).execution_options(populate_existing=True)
    plan = db.scalar(stmt)
    if plan is None:
        raise NotFoundError("Billing plan not found", code="plan_not_found")
    return plan


def _line_items(items: list[PlanLineItemIn]) -> list[PlanLineItem]:
    return [
        PlanLineItem(
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            position=position,
        )
        for position, item in enumerate(items)
    ]


def _ensure_storable_total(items: Sequence[billing_engine.LineItemLike], tax_rate: Decimal) -> None:
    totals = billing_engine.compute_totals(items, tax_rate)
    if totals.total > MAX_PLAN_TOTAL or any(line.amount > MAX_PLAN_TOTAL for line in totals.lines):
        raise BadRequestError("Plan total is too large", code="plan_total_too_large")


def _has_bills(db: Session, plan: BillingPlan) -> bool:
    return db.scalar(select(Bill.id).where(Bill.plan_id == plan.id).limit(1)) is not None


def _plan_fields(plan: BillingPlan, customer_name: str) -> dict[str, Any]:
    totals = billing_engine.compute_totals(plan.line_items, plan.tax_rate)
    return {
        "id": plan.id,
        "customer_id": plan.customer_id,
        "customer_name": customer_name,
        "name": plan.name,
        "description": plan.description,
        "currency": plan.currency,
        "frequency": plan.frequency,
        "interval_count": plan.interval_count,
        "start_date": plan.start_date,
        "end_date": plan.end_date,
        "next_billing_date": plan.next_billing_date,
        "due_days": plan.due_days,
        "tax_rate": plan.tax_rate,
        "auto_send": plan.auto_send,
        "status": plan.status,
        "subtotal": totals.subtotal,
        "tax_amount": totals.tax_amount,
        "total": totals.total,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "line_items": [
            PlanLineItemOut(
                id=item.id,
                position=item.position,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                amount=line.amount,
            )
            for item, line in zip(plan.line_items, totals.lines, strict=True)
        ],
    }


def to_out(plan: BillingPlan) -> BillingPlanOut:
    """Serialize a plan (with line items and computed totals)."""
    return BillingPlanOut.model_validate(_plan_fields(plan, plan.customer.name))


def _transition(
    db: Session, user: User, plan_id: int, allowed: tuple[PlanStatus, ...], target: PlanStatus
) -> BillingPlan:
    plan = _get_owned_plan(db, user, plan_id, lock=True)
    if plan.status not in allowed:
        raise ConflictError(
            f"Cannot change a {plan.status.value} plan to {target.value}",
            code="invalid_plan_transition",
        )
    plan.status = target
    return plan


def _commit_and_reload(db: Session, user: User, plan: BillingPlan) -> BillingPlan:
    db.commit()
    return _get_owned_plan(db, user, plan.id)


# --------------------------------------------------------------------------- queries


def list_plans(
    db: Session,
    user: User,
    params: PageParams,
    customer_id: int | None = None,
    status: PlanStatus | None = None,
) -> tuple[list[BillingPlanListItem], int]:
    """One page of the user's plans (ordered by next billing date) and the total count."""
    filters: list[ColumnElement[bool]] = [BillingPlan.user_id == user.id]
    if customer_id is not None:
        filters.append(BillingPlan.customer_id == customer_id)
    if status is not None:
        filters.append(BillingPlan.status == status)

    total = db.scalar(select(func.count(BillingPlan.id)).where(*filters))
    rows = db.execute(
        select(BillingPlan, Customer.name)
        .join(Customer, Customer.id == BillingPlan.customer_id)
        .options(selectinload(BillingPlan.line_items))
        .where(*filters)
        .order_by(BillingPlan.next_billing_date, BillingPlan.id)
        .offset(params.offset)
        .limit(params.limit)
    ).all()
    items = [
        BillingPlanListItem.model_validate(_plan_fields(plan, customer_name))
        for plan, customer_name in rows
    ]
    return items, int(total or 0)


def get_plan(db: Session, user: User, plan_id: int) -> BillingPlan:
    """Load one of the user's plans (with line items) or raise 404 ``plan_not_found``."""
    return _get_owned_plan(db, user, plan_id)


def get_plan_detail(db: Session, user: User, plan_id: int) -> BillingPlanDetail:
    """Plan + next 6 billing dates + latest 10 bills."""
    plan = _get_owned_plan(db, user, plan_id)
    bill_rows = db.execute(
        select(
            Bill.id,
            Bill.bill_number,
            Bill.issue_date,
            Bill.due_date,
            Bill.period_start,
            Bill.total,
            Bill.currency,
            Bill.status,
        )
        .where(Bill.user_id == user.id, Bill.plan_id == plan.id)
        .order_by(Bill.issue_date.desc(), Bill.id.desc())
        .limit(RECENT_BILLS_LIMIT)
    ).all()
    return BillingPlanDetail.model_validate(
        {
            **_plan_fields(plan, plan.customer.name),
            "upcoming_dates": billing_engine.preview_schedule(plan, UPCOMING_COUNT),
            "recent_bills": [PlanBillSummary.model_validate(row) for row in bill_rows],
        }
    )


# --------------------------------------------------------------------------- commands


def create_plan(db: Session, user: User, data: BillingPlanCreate) -> BillingPlan:
    """Create a plan for an owned, active customer; ``next_billing_date = start_date``.

    Omitted ``currency`` / ``dueDays`` / ``taxRate`` come from the business profile.

    Raises:
        NotFoundError(customer_not_found), ConflictError(customer_archived),
        BadRequestError(plan_total_too_large).
    """
    customer = customer_service.get_customer(db, user, data.customer_id)
    if not customer.is_active:
        raise ConflictError(
            "Cannot create a plan for an archived customer", code="customer_archived"
        )
    profile = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user.id))

    currency = data.currency or (profile.default_currency if profile else DEFAULT_CURRENCY)
    due_days = data.due_days
    if due_days is None:
        due_days = profile.default_due_days if profile else DEFAULT_DUE_DAYS
    tax_rate = data.tax_rate
    if tax_rate is None:
        tax_rate = profile.default_tax_rate if profile else DEFAULT_TAX_RATE
    _ensure_storable_total(data.line_items, tax_rate)

    plan = BillingPlan(
        user_id=user.id,
        customer_id=customer.id,
        name=data.name,
        description=data.description,
        currency=currency,
        frequency=data.frequency,
        interval_count=data.interval_count,
        start_date=data.start_date,
        end_date=data.end_date,
        next_billing_date=data.start_date,
        due_days=due_days,
        tax_rate=tax_rate,
        auto_send=data.auto_send,
        status=PlanStatus.ACTIVE,
        line_items=_line_items(data.line_items),
    )
    db.add(plan)
    db.commit()
    logger.info("Created billing plan id=%s for user id=%s", plan.id, user.id)
    return _get_owned_plan(db, user, plan.id)


def update_plan(db: Session, user: User, plan_id: int, data: BillingPlanUpdate) -> BillingPlan:
    """Update a plan (only fields sent). Affects future bills only.

    Raises:
        ConflictError(plan_cancelled): the plan is cancelled.
        ConflictError(plan_has_bills): ``startDate`` changed after bills were generated.
        PlanValidationError(end_date_before_start_date), BadRequestError(plan_total_too_large).
    """
    plan = _get_owned_plan(db, user, plan_id, lock=True)
    if plan.status == PlanStatus.CANCELLED:
        raise ConflictError("A cancelled plan cannot be edited", code="plan_cancelled")
    changes = data.model_dump(exclude_unset=True, exclude={"line_items"})

    new_start: date = changes.get("start_date", plan.start_date)
    new_end: date | None = changes.get("end_date", plan.end_date)
    if new_end is not None and new_end < new_start:
        raise PlanValidationError(
            "endDate must be on or after startDate", code="end_date_before_start_date"
        )
    start_changed = new_start != plan.start_date
    if start_changed and _has_bills(db, plan):
        raise ConflictError(
            "The start date cannot change once bills have been generated",
            code="plan_has_bills",
        )

    if data.line_items is not None:
        _ensure_storable_total(data.line_items, changes.get("tax_rate", plan.tax_rate))
    elif "tax_rate" in changes:
        _ensure_storable_total(plan.line_items, changes["tax_rate"])

    for field, value in changes.items():
        setattr(plan, field, value)
    if start_changed:
        plan.next_billing_date = new_start
    if data.line_items is not None:
        plan.line_items.clear()
        db.flush()
        plan.line_items.extend(_line_items(data.line_items))
    logger.info("Updated billing plan id=%s for user id=%s", plan.id, user.id)
    return _commit_and_reload(db, user, plan)


def pause_plan(db: Session, user: User, plan_id: int) -> BillingPlan:
    """``active -> paused`` (409 ``invalid_plan_transition`` otherwise)."""
    plan = _transition(db, user, plan_id, (PlanStatus.ACTIVE,), PlanStatus.PAUSED)
    return _commit_and_reload(db, user, plan)


def resume_plan(db: Session, user: User, plan_id: int) -> BillingPlan:
    """``paused -> active``. Paused periods are NOT backfilled: ``next_billing_date`` rolls
    forward (on the plan's schedule) to the first date on or after today."""
    plan = _transition(db, user, plan_id, (PlanStatus.PAUSED,), PlanStatus.ACTIVE)
    today = date.today()
    next_date = plan.next_billing_date
    while next_date < today:
        next_date = billing_engine.advance(
            next_date, plan.frequency, plan.interval_count, billing_engine.anchor_day_for(plan)
        )
    plan.next_billing_date = next_date
    return _commit_and_reload(db, user, plan)


def cancel_plan(db: Session, user: User, plan_id: int) -> BillingPlan:
    """``active|paused -> cancelled`` (terminal; 409 ``invalid_plan_transition`` otherwise)."""
    plan = _transition(
        db, user, plan_id, (PlanStatus.ACTIVE, PlanStatus.PAUSED), PlanStatus.CANCELLED
    )
    return _commit_and_reload(db, user, plan)


def generate_now(db: Session, user: User, plan_id: int) -> Bill:
    """Generate the bill for the plan's current ``next_billing_date`` period (even if it is
    in the future), advance the plan and commit. Does not send the bill.

    Raises:
        ConflictError(plan_not_active | plan_ended | already_generated | profile_required).
    """
    plan = _get_owned_plan(db, user, plan_id, lock=True)
    if plan.status != PlanStatus.ACTIVE:
        raise ConflictError("Only active plans can generate bills", code="plan_not_active")
    period_start = plan.next_billing_date
    if plan.end_date is not None and period_start > plan.end_date:
        raise ConflictError("This plan has passed its end date", code="plan_ended")
    bill = billing_engine.generate_bill_for_period(db, plan, period_start, today=date.today())
    if bill is None:
        raise ConflictError(
            "A bill for this period has already been generated", code="already_generated"
        )
    plan.next_billing_date = billing_engine.advance(
        period_start, plan.frequency, plan.interval_count, billing_engine.anchor_day_for(plan)
    )
    db.commit()
    db.refresh(bill)
    logger.info("Generated bill id=%s now for plan id=%s", bill.id, plan.id)
    return bill
