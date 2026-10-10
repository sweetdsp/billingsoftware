"""Shared Pydantic building blocks for every API schema.

- :class:`APIModel` - camelCase JSON, ORM-friendly base for all schemas.
- :data:`Money` - ``Decimal`` serialized as a 2-dp string (``"1250.00"``).
- :class:`Page` / :class:`PageParams` - pagination contract.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from typing import Annotated, Generic, TypeVar

from fastapi import Query
from pydantic import BaseModel, ConfigDict, PlainSerializer
from pydantic.alias_generators import to_camel

TWO_PLACES = Decimal("0.01")


def quantize_money(value: Decimal) -> Decimal:
    """Round a Decimal to 2 places using ROUND_HALF_UP."""
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _serialize_money(value: Decimal) -> str:
    return str(quantize_money(Decimal(value)))


Money = Annotated[
    Decimal,
    PlainSerializer(_serialize_money, return_type=str, when_used="always"),
]
"""Monetary amount: ``Decimal`` in Python, 2-dp string in JSON (and in the OpenAPI schema)."""


class APIModel(BaseModel):
    """Base class for all request/response schemas (camelCase over the wire)."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        from_attributes=True,
    )


T = TypeVar("T")


class Page(APIModel, Generic[T]):
    """Paginated list response: ``{items, total, page, pageSize}``."""

    items: list[T]
    total: int
    page: int
    page_size: int


class PageParams:
    """Pagination query parameters, used as ``params: PageParams = Depends()``."""

    def __init__(
        self,
        page: Annotated[int, Query(ge=1, description="1-based page number")] = 1,
        page_size: Annotated[
            int, Query(alias="pageSize", ge=1, le=100, description="Items per page")
        ] = 20,
    ) -> None:
        self.page = page
        self.page_size = page_size

    @property
    def offset(self) -> int:
        """Row offset for SQL ``OFFSET``."""
        return (self.page - 1) * self.page_size

    @property
    def limit(self) -> int:
        """Row limit for SQL ``LIMIT``."""
        return self.page_size
