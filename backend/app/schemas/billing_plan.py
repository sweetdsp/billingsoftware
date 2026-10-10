"""Billing plan request/response schemas (Module 4).

Money (``unitPrice``, ``amount``, totals), ``quantity`` and ``taxRate`` are decimal strings
in JSON. Totals are always computed server-side by ``billing_engine.compute_totals``.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, PlainSerializer, StringConstraints, field_validator, model_validator

from app.enums import BillingFrequency, BillStatus, PlanStatus
from app.schemas.base import APIModel, Money, quantize_money
from app.schemas.business_profile import Rate

CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
MAX_LINE_ITEMS = 50
MAX_QUANTITY = Decimal("1000000")
MAX_UNIT_PRICE = Decimal("9999999999.99")


def _serialize_quantity(value: Decimal) -> str:
    return str(quantize_money(Decimal(value)))


Quantity = Annotated[
    Decimal,
    PlainSerializer(_serialize_quantity, return_type=str, when_used="always"),
]
"""Line quantity (> 0, 2 dp): ``Decimal`` in Python, string such as ``"1.50"`` in JSON."""

PlanName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
LineDescription = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)
]
PlanDescription = Annotated[str | None, Field(max_length=2000)]
IntervalCount = Annotated[int, Field(ge=1, le=24)]
DueDays = Annotated[int, Field(ge=0, le=365)]
TaxRateIn = Annotated[Rate, Field(ge=Decimal("0"), le=Decimal("100"), decimal_places=2)]


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return value


def _normalize_currency(value: object) -> object:
    if isinstance(value, str):
        value = value.strip().upper()
        if not CURRENCY_RE.match(value):
            raise ValueError("must be an ISO-4217 code of 3 letters, e.g. USD")
    return value


class PlanLineItemIn(APIModel):
    """A line item in a create/update payload (order = position)."""

    description: LineDescription
    quantity: Quantity = Field(
        default=Decimal("1"), gt=Decimal("0"), le=MAX_QUANTITY, decimal_places=2
    )
    unit_price: Money = Field(ge=Decimal("0"), le=MAX_UNIT_PRICE, decimal_places=2)


class PlanLineItemOut(APIModel):
    """A stored plan line item with its computed amount."""

    id: int
    position: int
    description: str
    quantity: Quantity
    unit_price: Money
    amount: Money


class BillingPlanCreate(APIModel):
    """Payload for ``POST /billing-plans``.

    ``currency``, ``dueDays`` and ``taxRate`` default to the business profile's defaults
    (``USD`` / 7 / 0 when there is no profile) when omitted or null.
    """

    customer_id: int = Field(gt=0)
    name: PlanName
    description: PlanDescription = None
    currency: str | None = None
    frequency: BillingFrequency
    interval_count: IntervalCount = 1
    start_date: date
    end_date: date | None = None
    due_days: DueDays | None = None
    tax_rate: TaxRateIn | None = None
    auto_send: bool = True
    line_items: list[PlanLineItemIn] = Field(min_length=1, max_length=MAX_LINE_ITEMS)

    _blank_description = field_validator("description", mode="before")(_blank_to_none)
    _currency = field_validator("currency", mode="before")(_normalize_currency)

    @model_validator(mode="after")
    def _end_after_start(self) -> BillingPlanCreate:
        if self.end_date is not None and self.end_date < self.start_date:
            raise ValueError("endDate must be on or after startDate")
        return self


class BillingPlanUpdate(APIModel):
    """Payload for ``PUT /billing-plans/{id}``. Only fields sent are changed.

    ``customerId`` cannot be changed. ``description`` and ``endDate`` may be sent as ``null``
    to clear them; other fields may be omitted but not set to ``null``. ``lineItems``, when
    sent, replaces all line items. ``startDate`` can only change while the plan has no bills.
    """

    name: PlanName | None = None
    description: PlanDescription = None
    currency: str | None = None
    frequency: BillingFrequency | None = None
    interval_count: IntervalCount | None = None
    start_date: date | None = None
    end_date: date | None = None
    due_days: DueDays | None = None
    tax_rate: TaxRateIn | None = None
    auto_send: bool | None = None
    line_items: list[PlanLineItemIn] | None = Field(
        default=None, min_length=1, max_length=MAX_LINE_ITEMS
    )

    _blank_description = field_validator("description", mode="before")(_blank_to_none)
    _currency = field_validator("currency", mode="before")(_normalize_currency)

    @field_validator(
        "name",
        "currency",
        "frequency",
        "interval_count",
        "start_date",
        "due_days",
        "tax_rate",
        "auto_send",
        "line_items",
    )
    @classmethod
    def _not_null(cls, value: object) -> object:
        # Runs only for explicitly provided values; omitted fields keep the default.
        if value is None:
            raise ValueError("must not be null")
        return value


class BillingPlanListItem(APIModel):
    """A row of ``GET /billing-plans`` (no line items; totals per period included)."""

    id: int
    customer_id: int
    customer_name: str
    name: str
    description: str | None
    currency: str
    frequency: BillingFrequency
    interval_count: int
    start_date: date
    end_date: date | None
    next_billing_date: date
    due_days: int
    tax_rate: Rate
    auto_send: bool
    status: PlanStatus
    subtotal: Money
    tax_amount: Money
    total: Money
    created_at: datetime
    updated_at: datetime


class BillingPlanOut(BillingPlanListItem):
    """A billing plan with its line items."""

    line_items: list[PlanLineItemOut]


class PlanBillSummary(APIModel):
    """Compact view of a bill generated by a plan."""

    id: int
    bill_number: str
    issue_date: date
    due_date: date
    period_start: date | None
    total: Money
    currency: str
    status: BillStatus


class BillingPlanDetail(BillingPlanOut):
    """``GET /billing-plans/{id}``: plan + next 6 billing dates + latest 10 bills."""

    upcoming_dates: list[date]
    recent_bills: list[PlanBillSummary]


class GeneratedBillOut(APIModel):
    """Result of ``POST /billing-plans/{id}/generate-now``."""

    bill_id: int
    bill_number: str
