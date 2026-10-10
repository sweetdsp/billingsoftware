"""Billing plans API (Module 4): ``/api/v1/billing-plans``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.enums import PlanStatus
from app.models import User
from app.schemas.base import Page, PageParams
from app.schemas.billing_plan import (
    BillingPlanCreate,
    BillingPlanDetail,
    BillingPlanListItem,
    BillingPlanOut,
    BillingPlanUpdate,
    GeneratedBillOut,
)
from app.services import plan_service

router = APIRouter(prefix="/billing-plans", tags=["billing-plans"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=Page[BillingPlanListItem])
def list_plans(
    db: DbSession,
    user: CurrentUser,
    params: Annotated[PageParams, Depends()],
    customer_id: Annotated[int | None, Query(alias="customerId", gt=0)] = None,
    plan_status: Annotated[PlanStatus | None, Query(alias="status")] = None,
) -> Page[BillingPlanListItem]:
    """List the user's plans ordered by next billing date, with per-period totals."""
    items, total = plan_service.list_plans(db, user, params, customer_id, plan_status)
    return Page[BillingPlanListItem](
        items=items, total=total, page=params.page, page_size=params.page_size
    )


@router.post("", response_model=BillingPlanOut, status_code=status.HTTP_201_CREATED)
def create_plan(payload: BillingPlanCreate, db: DbSession, user: CurrentUser) -> BillingPlanOut:
    """Create a plan (``nextBillingDate = startDate``); defaults come from the profile."""
    return plan_service.to_out(plan_service.create_plan(db, user, payload))


@router.get("/{plan_id}", response_model=BillingPlanDetail)
def get_plan(plan_id: int, db: DbSession, user: CurrentUser) -> BillingPlanDetail:
    """Plan detail with totals, the next 6 billing dates and the latest 10 bills."""
    return plan_service.get_plan_detail(db, user, plan_id)


@router.put("/{plan_id}", response_model=BillingPlanOut)
def update_plan(
    plan_id: int, payload: BillingPlanUpdate, db: DbSession, user: CurrentUser
) -> BillingPlanOut:
    """Update a plan (future bills only; ``lineItems`` replaces all items)."""
    return plan_service.to_out(plan_service.update_plan(db, user, plan_id, payload))


@router.post("/{plan_id}/pause", response_model=BillingPlanOut)
def pause_plan(plan_id: int, db: DbSession, user: CurrentUser) -> BillingPlanOut:
    """``active -> paused``."""
    return plan_service.to_out(plan_service.pause_plan(db, user, plan_id))


@router.post("/{plan_id}/resume", response_model=BillingPlanOut)
def resume_plan(plan_id: int, db: DbSession, user: CurrentUser) -> BillingPlanOut:
    """``paused -> active``; skipped periods are not backfilled."""
    return plan_service.to_out(plan_service.resume_plan(db, user, plan_id))


@router.post("/{plan_id}/cancel", response_model=BillingPlanOut)
def cancel_plan(plan_id: int, db: DbSession, user: CurrentUser) -> BillingPlanOut:
    """``active|paused -> cancelled`` (terminal)."""
    return plan_service.to_out(plan_service.cancel_plan(db, user, plan_id))


@router.post(
    "/{plan_id}/generate-now",
    response_model=GeneratedBillOut,
    status_code=status.HTTP_201_CREATED,
)
def generate_now(plan_id: int, db: DbSession, user: CurrentUser) -> GeneratedBillOut:
    """Generate the bill for the plan's next period immediately (as a draft) and advance."""
    bill = plan_service.generate_now(db, user, plan_id)
    return GeneratedBillOut(bill_id=bill.id, bill_number=bill.bill_number)
