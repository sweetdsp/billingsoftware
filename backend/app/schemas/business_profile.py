"""Schemas for the business profile (branding + billing defaults)."""

from __future__ import annotations

import re
from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import EmailStr, Field, PlainSerializer, computed_field, field_validator

from app.schemas.base import APIModel, quantize_money
from app.schemas.upload import upload_url


def _serialize_rate(value: Decimal) -> str:
    return str(quantize_money(Decimal(value)))


Rate = Annotated[
    Decimal,
    PlainSerializer(_serialize_rate, return_type=str, when_used="always"),
]
"""Percentage rate (0-100, 2 dp): ``Decimal`` in Python, string such as ``"18.00"`` in JSON."""

CURRENCY_RE = re.compile(r"^[A-Z]{3}$")
BILL_PREFIX_RE = re.compile(r"^[A-Za-z0-9\-_/]*$")
MAX_REMINDER_DAYS = 10


def _blank_to_none(value: object) -> object:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return value


class BusinessProfileIn(APIModel):
    """Create/update payload for ``PUT /business-profile``."""

    business_name: str = Field(min_length=1, max_length=200)
    address: str | None = Field(default=None, max_length=2000)
    phone: str | None = Field(default=None, max_length=50)
    email: EmailStr | None = None
    tax_id: str | None = Field(default=None, max_length=64)
    default_currency: str = "USD"
    bill_number_prefix: str = Field(default="BM-", max_length=20)
    default_due_days: int = Field(default=7, ge=0, le=365)
    default_tax_rate: Rate = Field(
        default=Decimal("0"), ge=Decimal("0"), le=Decimal("100"), max_digits=5, decimal_places=2
    )
    reminder_days_after_due: list[int] = Field(default_factory=lambda: [1, 7, 14])
    footer_note: str | None = Field(default=None, max_length=1000)
    logo_file_id: int | None = Field(default=None, gt=0)

    @field_validator("business_name", mode="before")
    @classmethod
    def _strip_name(cls, value: object) -> object:
        return value.strip() if isinstance(value, str) else value

    @field_validator("address", "phone", "email", "tax_id", "footer_note", mode="before")
    @classmethod
    def _blank_optional(cls, value: object) -> object:
        return _blank_to_none(value)

    @field_validator("default_currency", mode="before")
    @classmethod
    def _check_currency(cls, value: object) -> object:
        if isinstance(value, str):
            value = value.strip()
            if not CURRENCY_RE.match(value):
                raise ValueError("must be an ISO-4217 code of 3 uppercase letters, e.g. USD")
        return value

    @field_validator("bill_number_prefix")
    @classmethod
    def _check_prefix(cls, value: str) -> str:
        if not BILL_PREFIX_RE.match(value):
            raise ValueError("may only contain letters, digits, '-', '_' and '/'")
        return value

    @field_validator("reminder_days_after_due")
    @classmethod
    def _check_reminder_days(cls, value: list[int]) -> list[int]:
        if len(value) > MAX_REMINDER_DAYS:
            raise ValueError(f"at most {MAX_REMINDER_DAYS} reminder days allowed")
        if any(day < 1 or day > 365 for day in value):
            raise ValueError("each reminder day must be between 1 and 365")
        if len(set(value)) != len(value):
            raise ValueError("reminder days must be unique")
        return sorted(value)


class BusinessProfileOut(APIModel):
    """The stored business profile."""

    id: int
    business_name: str
    address: str | None
    phone: str | None
    email: str | None
    tax_id: str | None
    default_currency: str
    bill_number_prefix: str
    next_bill_number: int
    default_due_days: int
    default_tax_rate: Rate
    reminder_days_after_due: list[int]
    footer_note: str | None
    logo_file_id: int | None
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def logo_url(self) -> str | None:
        """Download URL of the logo, or ``None`` when no logo is set."""
        return upload_url(self.logo_file_id) if self.logo_file_id is not None else None
