"""Outgoing email audit log."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import EmailStatus, EmailTemplate
from app.models.base import CreatedAtMixin, str_enum

if TYPE_CHECKING:
    from app.models.bill import Bill
    from app.models.user import User


class EmailLog(CreatedAtMixin, Base):
    """One row per email attempt (used for bill email history and reminder de-duplication)."""

    __tablename__ = "email_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    bill_id: Mapped[int | None] = mapped_column(
        ForeignKey("bills.id", ondelete="SET NULL"), index=True, nullable=True
    )
    to_email: Mapped[str] = mapped_column(String(255), nullable=False)
    template: Mapped[EmailTemplate] = mapped_column(
        str_enum(EmailTemplate, "template"), nullable=False
    )
    resend_message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[EmailStatus] = mapped_column(
        str_enum(EmailStatus, "status"),
        default=EmailStatus.QUEUED,
        server_default=EmailStatus.QUEUED.value,
        nullable=False,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped[User] = relationship(back_populates="email_logs")
    bill: Mapped[Bill | None] = relationship(back_populates="email_logs")
