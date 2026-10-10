"""Dashboard analytics schemas (Module 7).

All money figures are reported in a single currency (the business profile's
``default_currency``, or ``"USD"`` before onboarding); data in other currencies is left
out of the sums and the currency codes are listed in ``excludedCurrencies``.
"""

from __future__ import annotations

from datetime import date
from typing import Literal

from app.schemas.base import APIModel, Money

AgingLabel = Literal["0-30", "31-60", "61-90", "90+"]


class UpcomingBill(APIModel):
    """An active plan that will generate a bill within the next 7 days."""

    plan_id: int
    plan_name: str
    customer_id: int
    customer_name: str
    next_billing_date: date
    total: Money
    currency: str


class AnalyticsSummary(APIModel):
    """Headline dashboard numbers."""

    currency: str
    mrr: Money
    collected_this_month: Money
    outstanding: Money
    overdue_amount: Money
    overdue_count: int
    active_plans: int
    active_customers: int
    upcoming_bills: list[UpcomingBill]
    excluded_currencies: list[str]


class RevenuePoint(APIModel):
    """Billed vs collected for one calendar month (``month`` = ``"YYYY-MM"``)."""

    month: str
    billed: Money
    collected: Money


class AgingBucket(APIModel):
    """Unpaid balance of past-due bills, by days past due."""

    label: AgingLabel
    amount: Money
    count: int


class AgingReport(APIModel):
    """Receivables aging report."""

    currency: str
    buckets: list[AgingBucket]


class TopCustomer(APIModel):
    """A customer ranked by payments collected in the last 12 months."""

    customer_id: int
    customer_name: str
    collected: Money
