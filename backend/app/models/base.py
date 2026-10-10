"""Shared model mixins and column-type helpers."""

import enum
from datetime import datetime

from sqlalchemy import CHAR, DateTime, Numeric, func
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

# Column types shared across models (PRP "Money" contract).
MONEY = Numeric(12, 2)
RATE = Numeric(5, 2)
QUANTITY = Numeric(10, 2)
CURRENCY = CHAR(3)


def str_enum(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    """Build a non-native enum type stored as VARCHAR(32) with a named CHECK constraint.

    ``name`` becomes the CHECK constraint name via the ``ck`` naming convention
    (``ck_<table>_<name>``); by convention it is the column name.
    """
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        validate_strings=True,
        values_callable=lambda e: [m.value for m in e],
    )


class CreatedAtMixin:
    """Adds a timezone-aware ``created_at`` set by the database."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )


class TimestampMixin:
    """Adds timezone-aware ``created_at`` and ``updated_at`` (bumped on every UPDATE)."""

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
