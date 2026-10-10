"""Uploaded / stored file metadata."""

from __future__ import annotations

from typing import TYPE_CHECKING

from sqlalchemy import BigInteger, CheckConstraint, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base
from app.enums import FilePurpose
from app.models.base import TimestampMixin, str_enum

if TYPE_CHECKING:
    from app.models.user import User


class UploadedFile(TimestampMixin, Base):
    """Metadata for a file held by ``storage_service`` (logo, attachment or bill PDF)."""

    __tablename__ = "uploaded_files"
    __table_args__ = (CheckConstraint("size_bytes >= 0", name="size_bytes_non_negative"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(127), nullable=False)
    size_bytes: Mapped[int] = mapped_column(BigInteger, nullable=False)
    storage_key: Mapped[str] = mapped_column(String(512), unique=True, nullable=False)
    purpose: Mapped[FilePurpose] = mapped_column(str_enum(FilePurpose, "purpose"), nullable=False)

    user: Mapped[User] = relationship(back_populates="uploaded_files")
