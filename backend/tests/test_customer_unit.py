"""Pure unit tests for the customers module (no database needed)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.models import User
from app.schemas.base import PageParams
from app.schemas.customer import (
    CustomerCreate,
    CustomerListItem,
    CustomerUpdate,
)
from app.services.customer_service import build_list_query, escape_like


@pytest.fixture(autouse=True)
def sent_emails() -> list[dict[str, object]]:
    """Override conftest's autouse email patch: these pure tests never send email."""
    return []


# --------------------------------------------------------------------------- escape_like


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("acme", "acme"),
        ("100%", "100\\%"),
        ("a_b", "a\\_b"),
        ("back\\slash", "back\\\\slash"),
        ("%_\\", "\\%\\_\\\\"),
        ("", ""),
    ],
)
def test_escape_like(raw: str, expected: str) -> None:
    assert escape_like(raw) == expected


# --------------------------------------------------------------------------- CustomerCreate


def test_create_normalizes_email_and_strips_name() -> None:
    c = CustomerCreate.model_validate({"name": "  Acme Ltd ", "email": "  Billing@ACME.Com "})
    assert c.email == "billing@acme.com"
    assert c.name == "Acme Ltd"


def test_create_accepts_camel_case_and_blank_optional_becomes_none() -> None:
    c = CustomerCreate.model_validate(
        {
            "name": "Acme",
            "email": "a@example.com",
            "companyName": "Acme Inc",
            "billingAddress": "1 Main St",
            "taxId": "   ",
            "phone": "",
        }
    )
    assert c.company_name == "Acme Inc"
    assert c.billing_address == "1 Main St"
    assert c.tax_id is None
    assert c.phone is None


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Acme"},  # missing email
        {"name": "Acme", "email": "not-an-email"},
        {"name": "Acme", "email": None},
        {"name": "   ", "email": "a@example.com"},
        {"name": "x" * 201, "email": "a@example.com"},
        {"email": "a@example.com"},  # missing name
        {"name": "Acme", "email": "a@example.com", "phone": "1" * 51},
        {"name": "Acme", "email": "a@example.com", "companyName": "c" * 201},
        {"name": "Acme", "email": "a@example.com", "billingAddress": "a" * 1001},
        {"name": "Acme", "email": "a@example.com", "taxId": "t" * 51},
        {"name": "Acme", "email": "a@example.com", "notes": "n" * 2001},
    ],
)
def test_create_rejects_invalid(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        CustomerCreate.model_validate(payload)


# --------------------------------------------------------------------------- CustomerUpdate


def test_update_only_sent_fields_are_set() -> None:
    u = CustomerUpdate.model_validate({"email": "NEW@Example.com", "isActive": True})
    assert u.model_dump(exclude_unset=True) == {"email": "new@example.com", "is_active": True}


def test_update_allows_clearing_optional_text() -> None:
    u = CustomerUpdate.model_validate({"phone": None, "notes": ""})
    assert u.model_dump(exclude_unset=True) == {"phone": None, "notes": None}


@pytest.mark.parametrize(
    "payload",
    [
        {"email": "bad"},
        {"email": None},
        {"name": None},
        {"name": ""},
        {"isActive": None},
    ],
)
def test_update_rejects_invalid(payload: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        CustomerUpdate.model_validate(payload)


# --------------------------------------------------------------------------- serialization


def test_list_item_serializes_camel_case_and_money_string() -> None:
    from datetime import UTC, datetime

    now = datetime(2026, 1, 1, tzinfo=UTC)
    item = CustomerListItem.model_validate(
        {
            "id": 1,
            "name": "Acme",
            "email": "a@example.com",
            "phone": None,
            "company_name": None,
            "billing_address": None,
            "tax_id": None,
            "notes": None,
            "is_active": True,
            "created_at": now,
            "updated_at": now,
            "balance_due": Decimal("12.5"),
            "active_plan_count": 2,
        }
    )
    data = item.model_dump(mode="json", by_alias=True)
    assert data["balanceDue"] == "12.50"
    assert data["activePlanCount"] == 2
    assert data["isActive"] is True
    assert "companyName" in data


# --------------------------------------------------------------------------- SQL shape


def test_list_query_is_single_statement_with_grouped_aggregates() -> None:
    user = User(id=7, email="o@example.com")
    stmt = build_list_query(user, "50%_off", True, PageParams(page=2, page_size=10))
    sql = str(stmt.compile(dialect=postgresql.dialect()))
    assert sql.count("GROUP BY") == 2
    assert "LEFT OUTER JOIN" in sql
    assert "ILIKE" in sql
    assert "ESCAPE" in sql
    assert "lower(customers.name)" in sql
    assert "LIMIT" in sql and "OFFSET" in sql
