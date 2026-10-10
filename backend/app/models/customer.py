"""Customers (the people/companies being billed)."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import Boolean, ForeignKey, Index, String, Text, func, true
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import TimestampMixin

if TYPE_CHECKING:
    from app.models.bill import Bill
    from app.models.billing_plan import BillingPlan
    from app.models.user import User


class Customer(TimestampMixin, Base):
    """A customer of the user's business. Archived (``is_active=False``), never hard-deleted."""

    __tablename__ = "customers"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    company_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    billing_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=true(), nullable=False
    )

    user: Mapped[User] = relationship(back_populates="customers")
    billing_plans: Mapped[list[BillingPlan]] = relationship(back_populates="customer")
    bills: Mapped[list[Bill]] = relationship(back_populates="customer")

    __table_args__ = (
        Index("ix_customers_user_id_is_active", "user_id", "is_active"),
        Index("ix_customers_user_id_lower_name", "user_id", func.lower(name)),
        # One ACTIVE customer per email per user (case-insensitive); archived ones may repeat.
        Index(
            "uq_customers_user_id_lower_email_active",
            "user_id",
            func.lower(email),
            unique=True,
            postgresql_where=is_active,
        ),
    )
