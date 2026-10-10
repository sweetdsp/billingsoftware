"""Payment request/response schemas (Module 6)."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from pydantic import AfterValidator, Field, field_validator

from app.enums import PaymentMethod, PaymentProvider, PaymentStatus
from app.schemas.base import APIModel, Money

MAX_PAYMENT_AMOUNT = Decimal("9999999999.99")  # Numeric(12, 2)
PAID_AT_CLOCK_SKEW = timedelta(minutes=5)
"""Tolerance for client clocks running slightly ahead when validating ``paidAt``."""

MANUAL_METHODS: frozenset[PaymentMethod] = frozenset(
    {PaymentMethod.CASH, PaymentMethod.BANK_TRANSFER, PaymentMethod.CHEQUE, PaymentMethod.OTHER}
)
"""Methods allowed for manual payments (``online`` is reserved for Dodo -> 400 invalid_method)."""


def _blank_to_none(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


Notes = Annotated[str | None, Field(max_length=500), AfterValidator(_blank_to_none)]


class ManualPaymentCreate(APIModel):
    """Payload for ``POST /bills/{id}/payments`` (cash, bank transfer, cheque, other)."""

    amount: Annotated[Money, Field(gt=0, le=MAX_PAYMENT_AMOUNT, decimal_places=2)]
    method: PaymentMethod
    paid_at: datetime | None = None
    notes: Notes = None

    @field_validator("paid_at")
    @classmethod
    def _paid_at_not_in_future(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is None:
            value = value.replace(tzinfo=UTC)
        if value > datetime.now(UTC) + PAID_AT_CLOCK_SKEW:
            raise ValueError("paidAt cannot be in the future")
        return value


class PaymentOut(APIModel):
    """A payment as returned by the API (list rows and create response)."""

    id: int
    bill_id: int
    bill_number: str
    customer_id: int
    customer_name: str
    amount: Money
    currency: str
    method: PaymentMethod
    provider: PaymentProvider
    provider_payment_id: str | None
    status: PaymentStatus
    paid_at: datetime
    notes: str | None
    created_at: datetime


class WebhookAck(APIModel):
    """Response body for ``POST /webhooks/dodo``."""

    status: Literal["processed", "duplicate", "unmatched", "ignored"]
