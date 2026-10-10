"""Customer request/response schemas (Module 3).

The ``Customer*Summary`` schemas are compact views of plans, bills and payments used by
the customer detail page. They are prefixed so the Plans/Bills/Payments modules can reuse
or replace them without name clashes.
"""

from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, EmailStr, Field, StringConstraints, field_validator

from app.enums import BillingFrequency, BillStatus, PaymentMethod, PaymentStatus, PlanStatus
from app.schemas.base import APIModel, Money


def _blank_to_none(value: str | None) -> str | None:
    """Treat empty/whitespace-only optional text as "not provided"."""
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def normalize_email(value: str) -> str:
    """Canonical stored form of a customer email: stripped and lowercased."""
    return value.strip().lower()


Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
CustomerEmail = Annotated[EmailStr, AfterValidator(normalize_email)]
Phone = Annotated[str | None, Field(max_length=50), AfterValidator(_blank_to_none)]
CompanyName = Annotated[str | None, Field(max_length=200), AfterValidator(_blank_to_none)]
BillingAddress = Annotated[str | None, Field(max_length=1000), AfterValidator(_blank_to_none)]
TaxId = Annotated[str | None, Field(max_length=50), AfterValidator(_blank_to_none)]
Notes = Annotated[str | None, Field(max_length=2000), AfterValidator(_blank_to_none)]


class CustomerCreate(APIModel):
    """Payload for ``POST /customers``. ``email`` is required (bills are delivered by email)."""

    name: Name
    email: CustomerEmail
    phone: Phone = None
    company_name: CompanyName = None
    billing_address: BillingAddress = None
    tax_id: TaxId = None
    notes: Notes = None


class CustomerUpdate(APIModel):
    """Payload for ``PUT /customers/{id}``. Only fields sent are changed.

    ``name``, ``email`` and ``isActive`` may be omitted but not set to ``null``.
    Optional text fields may be sent as ``null`` (or blank) to clear them.
    ``isActive: true`` un-archives a customer.
    """

    name: Name | None = None
    email: CustomerEmail | None = None
    phone: Phone = None
    company_name: CompanyName = None
    billing_address: BillingAddress = None
    tax_id: TaxId = None
    notes: Notes = None
    is_active: bool | None = None

    @field_validator("name", "email", "is_active")
    @classmethod
    def _not_null(cls, value: object) -> object:
        # Runs only for explicitly provided values; omitted fields keep the default.
        if value is None:
            raise ValueError("must not be null")
        return value


class CustomerOut(APIModel):
    """A customer as returned by the API."""

    id: int
    name: str
    email: str
    phone: str | None
    company_name: str | None
    billing_address: str | None
    tax_id: str | None
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class CustomerListItem(CustomerOut):
    """A row of ``GET /customers``: the customer plus balance due and active plan count."""

    balance_due: Money
    active_plan_count: int


class CustomerPlanSummary(APIModel):
    """Compact billing plan view on the customer detail page."""

    id: int
    name: str
    status: PlanStatus
    frequency: BillingFrequency
    interval_count: int
    next_billing_date: date
    currency: str
    total: Money


class CustomerBillSummary(APIModel):
    """Compact bill view on the customer detail page."""

    id: int
    bill_number: str
    issue_date: date
    due_date: date
    total: Money
    amount_paid: Money
    status: BillStatus
    currency: str


class CustomerPaymentSummary(APIModel):
    """Compact payment view on the customer detail page."""

    id: int
    bill_id: int
    amount: Money
    currency: str
    method: PaymentMethod
    status: PaymentStatus
    paid_at: datetime


class CustomerDetail(CustomerOut):
    """``GET /customers/{id}``: customer + balance, plans, latest bills and payments."""

    balance_due: Money
    plans: list[CustomerPlanSummary]
    recent_bills: list[CustomerBillSummary]
    recent_payments: list[CustomerPaymentSummary]
