"""Payments against bills and idempotency records for inbound webhooks."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING, Any

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import PaymentMethod, PaymentProvider, PaymentStatus
from app.models.base import CURRENCY, MONEY, CreatedAtMixin, TimestampMixin, str_enum

if TYPE_CHECKING:
    from app.models.bill import Bill
    from app.models.user import User


class Payment(TimestampMixin, Base):
    """A payment (manual or via Dodo) applied to a bill.

    ``provider_payment_id`` is unique so a replayed webhook can never create a duplicate.
    """

    __tablename__ = "payments"
    __table_args__ = (CheckConstraint("amount > 0", name="amount_positive"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    bill_id: Mapped[int] = mapped_column(ForeignKey("bills.id"), index=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(MONEY, nullable=False)
    currency: Mapped[str] = mapped_column(CURRENCY, nullable=False)
    method: Mapped[PaymentMethod] = mapped_column(str_enum(PaymentMethod, "method"), nullable=False)
    provider: Mapped[PaymentProvider] = mapped_column(
        str_enum(PaymentProvider, "provider"), nullable=False
    )
    provider_payment_id: Mapped[str | None] = mapped_column(String(255), unique=True, nullable=True)
    status: Mapped[PaymentStatus] = mapped_column(
        str_enum(PaymentStatus, "status"),
        default=PaymentStatus.SUCCEEDED,
        server_default=PaymentStatus.SUCCEEDED.value,
        nullable=False,
    )
    paid_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="payments")
    bill: Mapped[Bill] = relationship(back_populates="payments")


class WebhookEvent(CreatedAtMixin, Base):
    """An inbound webhook delivery, recorded once per ``event_id`` for idempotency."""

    __tablename__ = "webhook_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[PaymentProvider] = mapped_column(
        str_enum(PaymentProvider, "provider"), nullable=False
    )
    event_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    event_type: Mapped[str] = mapped_column(String(100), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, nullable=False)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
