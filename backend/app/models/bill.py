"""Bills (invoices), their line items and attachments."""

from __future__ import annotations

import secrets
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import BillStatus
from app.models.base import CURRENCY, MONEY, QUANTITY, RATE, TimestampMixin, str_enum

if TYPE_CHECKING:
    from app.models.billing_plan import BillingPlan
    from app.models.customer import Customer
    from app.models.email_log import EmailLog
    from app.models.payment import Payment
    from app.models.upload import UploadedFile
    from app.models.user import User


def generate_public_token() -> str:
    """Unguessable token for the public ``/pay/{public_token}`` page."""
    return secrets.token_urlsafe(32)


class Bill(TimestampMixin, Base):
    """An invoice issued to a customer, either one-off or generated from a billing plan.

    Totals are computed server-side (``billing_engine.compute_totals``).
    ``UNIQUE(plan_id, period_start)`` guarantees the scheduler never double-bills.
    """

    __tablename__ = "bills"
    __table_args__ = (
        UniqueConstraint("user_id", "bill_number"),
        UniqueConstraint("plan_id", "period_start"),
        CheckConstraint("subtotal >= 0", name="subtotal_non_negative"),
        CheckConstraint("tax_rate >= 0 AND tax_rate <= 100", name="tax_rate_range"),
        CheckConstraint("tax_amount >= 0", name="tax_amount_non_negative"),
        CheckConstraint("total >= 0", name="total_non_negative"),
        CheckConstraint("amount_paid >= 0", name="amount_paid_non_negative"),
        Index("ix_bills_user_id_status", "user_id", "status"),
        Index("ix_bills_status_due_date", "status", "due_date"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    customer_id: Mapped[int] = mapped_column(ForeignKey("customers.id"), index=True, nullable=False)
    plan_id: Mapped[int | None] = mapped_column(
        ForeignKey("billing_plans.id", ondelete="SET NULL"), nullable=True
    )
    bill_number: Mapped[str] = mapped_column(String(50), nullable=False)
    issue_date: Mapped[date] = mapped_column(Date, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    currency: Mapped[str] = mapped_column(CURRENCY, nullable=False)
    subtotal: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    tax_rate: Mapped[Decimal] = mapped_column(
        RATE, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    total: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    amount_paid: Mapped[Decimal] = mapped_column(
        MONEY, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    status: Mapped[BillStatus] = mapped_column(
        str_enum(BillStatus, "status"),
        default=BillStatus.DRAFT,
        server_default=BillStatus.DRAFT.value,
        nullable=False,
    )
    pdf_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True
    )
    payment_link_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    dodo_checkout_id: Mapped[str | None] = mapped_column(String(255), index=True, nullable=True)
    public_token: Mapped[str] = mapped_column(
        String(64), unique=True, default=generate_public_token, nullable=False
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    user: Mapped[User] = relationship(back_populates="bills")
    customer: Mapped[Customer] = relationship(back_populates="bills")
    plan: Mapped[BillingPlan | None] = relationship(back_populates="bills")
    pdf_file: Mapped[UploadedFile | None] = relationship(foreign_keys=[pdf_file_id])
    line_items: Mapped[list[BillLineItem]] = relationship(
        back_populates="bill",
        order_by="BillLineItem.position",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )
    attachments: Mapped[list[BillAttachment]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", passive_deletes=True
    )
    payments: Mapped[list[Payment]] = relationship(
        back_populates="bill", order_by="Payment.paid_at"
    )
    email_logs: Mapped[list[EmailLog]] = relationship(
        back_populates="bill", order_by="EmailLog.created_at", passive_deletes=True
    )


class BillLineItem(Base):
    """An immutable line on a bill (``amount = quantity * unit_price``, rounded half-up)."""

    __tablename__ = "bill_line_items"
    __table_args__ = (
        CheckConstraint("quantity > 0", name="quantity_positive"),
        CheckConstraint("unit_price >= 0", name="unit_price_non_negative"),
        CheckConstraint("amount >= 0", name="amount_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bills.id", ondelete="CASCADE"), index=True, nullable=False
    )
    description: Mapped[str] = mapped_column(String(500), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(
        QUANTITY, default=Decimal("1"), server_default=text("1"), nullable=False
    )
    unit_price: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    position: Mapped[int] = mapped_column(
        Integer, default=0, server_default=text("0"), nullable=False
    )

    bill: Mapped[Bill] = relationship(back_populates="line_items")


class BillAttachment(TimestampMixin, Base):
    """(post-MVP) Links an uploaded file to a bill as an email attachment."""

    __tablename__ = "bill_attachments"
    __table_args__ = (UniqueConstraint("bill_id", "file_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    bill_id: Mapped[int] = mapped_column(
        ForeignKey("bills.id", ondelete="CASCADE"), index=True, nullable=False
    )
    file_id: Mapped[int] = mapped_column(
        ForeignKey("uploaded_files.id", ondelete="CASCADE"), index=True, nullable=False
    )

    bill: Mapped[Bill] = relationship(back_populates="attachments")
    file: Mapped[UploadedFile] = relationship()
