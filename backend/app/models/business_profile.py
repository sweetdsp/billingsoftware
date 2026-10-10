"""Business profile (branding + billing defaults), one per user."""

from __future__ import annotations

from decimal import Decimal
from typing import TYPE_CHECKING

from sqlalchemy import CheckConstraint, ForeignKey, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.models.base import CURRENCY, RATE, TimestampMixin

if TYPE_CHECKING:
    from app.models.upload import UploadedFile
    from app.models.user import User

DEFAULT_REMINDER_DAYS: tuple[int, ...] = (1, 7, 14)


def _default_reminder_days() -> list[int]:
    return list(DEFAULT_REMINDER_DAYS)


class BusinessProfile(TimestampMixin, Base):
    """The seller's business identity and defaults used when creating plans and bills.

    ``next_bill_number`` is incremented under ``SELECT ... FOR UPDATE`` by
    ``billing_engine.allocate_bill_number``.
    """

    __tablename__ = "business_profiles"
    __table_args__ = (
        CheckConstraint("next_bill_number >= 1", name="next_bill_number_positive"),
        CheckConstraint("default_due_days >= 0", name="default_due_days_non_negative"),
        CheckConstraint(
            "default_tax_rate >= 0 AND default_tax_rate <= 100", name="default_tax_rate_range"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    business_name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_file_id: Mapped[int | None] = mapped_column(
        ForeignKey("uploaded_files.id", ondelete="SET NULL"), nullable=True
    )
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    phone: Mapped[str | None] = mapped_column(String(50), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    tax_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    default_currency: Mapped[str] = mapped_column(
        CURRENCY, default="USD", server_default="USD", nullable=False
    )
    bill_number_prefix: Mapped[str] = mapped_column(
        String(20), default="BM-", server_default="BM-", nullable=False
    )
    next_bill_number: Mapped[int] = mapped_column(
        Integer, default=1, server_default=text("1"), nullable=False
    )
    default_due_days: Mapped[int] = mapped_column(
        Integer, default=7, server_default=text("7"), nullable=False
    )
    default_tax_rate: Mapped[Decimal] = mapped_column(
        RATE, default=Decimal("0"), server_default=text("0"), nullable=False
    )
    reminder_days_after_due: Mapped[list[int]] = mapped_column(
        ARRAY(Integer),
        default=_default_reminder_days,
        server_default=text("'{1,7,14}'"),
        nullable=False,
    )
    footer_note: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="business_profile")
    logo_file: Mapped[UploadedFile | None] = relationship(foreign_keys=[logo_file_id])
