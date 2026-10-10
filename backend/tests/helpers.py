"""Factories shared by the bills / payments / webhooks API tests."""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal
from itertools import count
from typing import Any

from sqlalchemy.orm import Session

from app.enums import BillStatus
from app.models import Bill, BillLineItem, BusinessProfile, Customer, User

_seq = count(1)


def make_profile(db: Session, user: User, **extra: Any) -> BusinessProfile:
    """A business profile (defaults come from the model: USD, no tax)."""
    profile = BusinessProfile(user_id=user.id, business_name="Acme Ltd", **extra)
    db.add(profile)
    db.flush()
    return profile


def make_customer(db: Session, user: User, name: str = "Cust", *, active: bool = True) -> Customer:
    """A customer owned by ``user``."""
    customer = Customer(
        user_id=user.id,
        name=name,
        email=f"{name.lower()}{next(_seq)}@example.com",
        is_active=active,
    )
    db.add(customer)
    db.flush()
    return customer


def make_bill(
    db: Session,
    user: User,
    customer: Customer,
    *,
    status: BillStatus = BillStatus.SENT,
    total: str = "100.00",
    due: date | None = None,
    currency: str = "USD",
    checkout_id: str | None = None,
) -> Bill:
    """A single-line bill (``total`` == subtotal, no tax)."""
    bill = Bill(
        user_id=user.id,
        customer_id=customer.id,
        bill_number=f"T-{next(_seq):05d}",
        issue_date=date.today(),
        due_date=due or date.today() + timedelta(days=14),
        currency=currency,
        subtotal=Decimal(total),
        total=Decimal(total),
        amount_paid=Decimal("0"),
        status=status,
        dodo_checkout_id=checkout_id,
    )
    bill.line_items = [
        BillLineItem(
            description="Service",
            quantity=Decimal("1"),
            unit_price=Decimal(total),
            amount=Decimal(total),
            position=0,
        )
    ]
    db.add(bill)
    db.flush()
    return bill
