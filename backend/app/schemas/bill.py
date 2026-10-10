"""Bill (invoice) request/response schemas (Module 5) and the public bill view.

Money, quantities and rates are ``Decimal`` in Python and 2-dp strings in JSON.
Totals are never accepted from the client: they are computed server-side
(``billing_engine.compute_totals``).
"""

from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, field_validator, model_validator

from app.enums import (
    BillStatus,
    EmailStatus,
    EmailTemplate,
    PaymentMethod,
    PaymentProvider,
    PaymentStatus,
)
from app.schemas.base import APIModel, Money
from app.schemas.business_profile import Rate

MAX_LINE_ITEMS = 50

Description = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=500)]
QuantityIn = Annotated[Decimal, Field(gt=0, max_digits=10, decimal_places=2)]
UnitPriceIn = Annotated[Decimal, Field(ge=0, max_digits=12, decimal_places=2)]
TaxRateIn = Annotated[Decimal, Field(ge=0, le=100, max_digits=5, decimal_places=2)]
CurrencyIn = Annotated[
    str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{3}$")
]


# --------------------------------------------------------------------------- requests


class BillLineItemIn(APIModel):
    """One line of a bill as sent by the client (the amount is computed server-side)."""

    description: Description
    quantity: QuantityIn = Decimal("1")
    unit_price: UnitPriceIn


class BillCreate(APIModel):
    """Payload for ``POST /bills`` (one-off bill, created as ``draft``).

    Omitted ``issueDate`` / ``dueDate`` / ``currency`` / ``taxRate`` fall back to today and
    the business profile defaults (``default_due_days``, ``default_currency``,
    ``default_tax_rate``).
    """

    customer_id: int = Field(gt=0)
    issue_date: date | None = None
    due_date: date | None = None
    currency: CurrencyIn | None = None
    tax_rate: TaxRateIn | None = None
    line_items: list[BillLineItemIn] = Field(min_length=1, max_length=MAX_LINE_ITEMS)

    @model_validator(mode="after")
    def _check_dates(self) -> BillCreate:
        if (
            self.issue_date is not None
            and self.due_date is not None
            and self.due_date < self.issue_date
        ):
            raise ValueError("dueDate must be on or after issueDate")
        return self


class BillUpdate(APIModel):
    """Payload for ``PUT /bills/{id}`` (draft bills only). Only fields sent are changed.

    Fields may be omitted but not set to ``null``. Sending ``lineItems`` replaces all lines.
    """

    customer_id: int | None = Field(default=None, gt=0)
    issue_date: date | None = None
    due_date: date | None = None
    currency: CurrencyIn | None = None
    tax_rate: TaxRateIn | None = None
    line_items: list[BillLineItemIn] | None = Field(
        default=None, min_length=1, max_length=MAX_LINE_ITEMS
    )

    @field_validator("customer_id", "issue_date", "due_date", "currency", "tax_rate", "line_items")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("may be omitted but not null")
        return value


# --------------------------------------------------------------------------- responses


class BillLineItemOut(APIModel):
    """A line on a bill."""

    id: int
    description: str
    quantity: Money
    unit_price: Money
    amount: Money
    position: int


class BillPaymentOut(APIModel):
    """A payment applied to the bill (bill detail page)."""

    id: int
    amount: Money
    method: PaymentMethod
    provider: PaymentProvider
    status: PaymentStatus
    paid_at: datetime
    notes: str | None


class BillEmailLogOut(APIModel):
    """One email attempt for the bill (bill detail page "Email history")."""

    id: int
    template: EmailTemplate
    to_email: str
    status: EmailStatus
    error: str | None
    created_at: datetime


class BillListItem(APIModel):
    """A row of ``GET /bills``."""

    id: int
    bill_number: str
    customer_id: int
    customer_name: str
    plan_id: int | None
    plan_name: str | None
    issue_date: date
    due_date: date
    period_start: date | None
    period_end: date | None
    currency: str
    total: Money
    amount_paid: Money
    balance_due: Money
    status: BillStatus
    sent_at: datetime | None
    paid_at: datetime | None
    created_at: datetime


class BillOut(BillListItem):
    """A bill with its amounts, links and PDF state (no line items)."""

    subtotal: Money
    tax_rate: Rate
    tax_amount: Money
    payment_link_url: str | None
    public_url: str
    has_pdf: bool
    updated_at: datetime


class BillDetail(BillOut):
    """``GET /bills/{id}``: bill + line items + payments + email history (newest first)."""

    line_items: list[BillLineItemOut]
    payments: list[BillPaymentOut]
    email_logs: list[BillEmailLogOut]


# --------------------------------------------------------------------------- public view


class PublicLineItem(APIModel):
    """A bill line on the public page (no internal ids)."""

    description: str
    quantity: Money
    unit_price: Money
    amount: Money


class PublicCustomer(APIModel):
    """Who the bill is addressed to (no contact details)."""

    name: str
    company_name: str | None


class PublicBusiness(APIModel):
    """The issuing business's public contact details."""

    name: str
    address: str | None
    email: str | None
    phone: str | None
    tax_id: str | None
    logo_url: str | None


class PublicBillOut(APIModel):
    """``GET /public/bills/{publicToken}``: read-only bill for the customer.

    Never exposes internal ids, the owner's account details or the customer's email.
    ``paymentLinkUrl`` is only present while the bill can still be paid.
    """

    bill_number: str
    issue_date: date
    due_date: date
    period_start: date | None
    period_end: date | None
    currency: str
    line_items: list[PublicLineItem]
    subtotal: Money
    tax_rate: Rate
    tax_amount: Money
    total: Money
    amount_paid: Money
    balance_due: Money
    status: BillStatus
    payment_link_url: str | None
    customer: PublicCustomer
    business: PublicBusiness
    footer_note: str | None
