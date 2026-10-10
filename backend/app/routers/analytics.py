"""Dashboard analytics API (Module 7): ``/api/v1/analytics``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.analytics import AgingReport, AnalyticsSummary, RevenuePoint, TopCustomer
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("/summary", response_model=AnalyticsSummary)
def get_summary(db: DbSession, user: CurrentUser) -> AnalyticsSummary:
    """MRR, collected this month, outstanding/overdue, counts and the next 7 days' bills."""
    return analytics_service.get_summary(db, user)


@router.get("/revenue", response_model=list[RevenuePoint])
def get_revenue(
    db: DbSession,
    user: CurrentUser,
    months: Annotated[int, Query(ge=1, le=24, description="Months incl. the current")] = 12,
) -> list[RevenuePoint]:
    """Billed vs collected per month (oldest first, zero-filled)."""
    return analytics_service.get_revenue(db, user, months)


@router.get("/aging", response_model=AgingReport)
def get_aging(db: DbSession, user: CurrentUser) -> AgingReport:
    """Unpaid balance of past-due bills in 0-30 / 31-60 / 61-90 / 90+ day buckets."""
    return analytics_service.get_aging(db, user)


@router.get("/top-customers", response_model=list[TopCustomer])
def get_top_customers(
    db: DbSession,
    user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=20, description="Max customers to return")] = 5,
) -> list[TopCustomer]:
    """Customers ranked by payments collected in the last 12 months."""
    return analytics_service.get_top_customers(db, user, limit)
