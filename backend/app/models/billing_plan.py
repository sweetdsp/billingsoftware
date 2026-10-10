"""Recurring billing plans and their line items."""

from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
    true,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import BillingFrequency, PlanStatus
from app.models.base import CURRENCY, MONEY, QUANTITY, RATE, TimestampMixin, str_enum

if TYPE_CHECKING:
    from app.models.bill import Bill
    from app.models.customer import Customer
    from app.models.user import User


class BillingPlan(TimestampMixin, Base):
    """A recurring schedule that generates bills for a customer.

    The scheduler scans ``(status, next_billing_date)``; ``bills.UNIQUE(plan_id, period_start)``
    makes generation idempotent.
    """

    __tablename__ = "billing_plans"
    __table_args__ = (
        CheckConstraint("interval_count >= 1", name="interval_count_positive"),
        CheckConstraint("due_days >= 0", name="due_days_non_negative"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint(
            "end_date IS NULL OR end_date >= start_date", name="end_date_after_start_date"
        ),
        Index("ix_billing_plans_status_next_billing_date", "status", "next_billing_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    currency: Mapped[str] = mapped_column(CURRENCY, nullable=False)
    frequency: Mapped[BillingFrequency] = mapped_column(
        str_enum(BillingFrequency, "frequency"), nullable=False
    )
    interval_count: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    next_billing_date: Mapped[date] = mapped_column(Date, index=True, nullable=False)
    due_days: Mapped[int] = mapped_column(
        Integer, default=7, server_default=text("7"), nullable=False
    )
    tax_rate: Mapped[Decimal] = mapped_column(
        RATE, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    auto_send: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )
    status: Mapped[PlanStatus] = mapped_column(
        str_enum(PlanStatus, "status"),
        default=PlanStatus.ACTIVE,
        server_default=PlanStatus.ACTIVE.value,
        nullable=False,
    )

    user: Mapped[User] = relationship(back_populates="billing_plans")
    customer: Mapped[Customer] = relationship(back_populates="billing_plans")
    line_items: Mapped[list[PlanLineItem]] = relationship(
        back_populates="plan",
        order_by="PlanLineItem.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    bills: Mapped[list[Bill]] = relationship(back_populates="plan")


class PlanLineItem(Base):
    """A line on a billing plan; snapshotted into ``BillLineItem`` on each generated bill."""

    __tablename__ = "plan_line_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    plan_id: Mapped[int] = mapped_column(
        ForeignKey("billing_plans.id", ondelete="CASCADE"), index=True, nullable=False
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(
        QUANTITY, default=Decimal("1"), server_default=text("1"), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    position: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )

    plan: Mapped[BillingPlan] = relationship(back_populates="line_items")
