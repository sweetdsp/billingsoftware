"""Payments API (Module 6): ``/api/v1/payments``."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.enums import PaymentMethod
from app.models import User
from app.schemas.base import Page, PageParams
from app.schemas.payment import PaymentOut
from app.services import payment_service

router = APIRouter(prefix="/payments", tags=["payments"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=Page[PaymentOut])
def list_payments(
    db: DbSession,
    user: CurrentUser,
    params: Annotated[PageParams, Depends()],
    customer_id: Annotated[int | None, Query(alias="customerId", gt=0)] = None,
    method: PaymentMethod | None = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> Page[PaymentOut]:
    """List the user's payments, newest first."""
    items, total = payment_service.list_payments(
        db,
        user,
        params,
        customer_id=customer_id,
        method=method,
        date_from=date_from,
        date_to=date_to,
    )
    return Page[PaymentOut](
        items=items, total=total, page=params.page, page_size=params.page_size
    )


@router.delete("/{payment_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def delete_payment(payment_id: int, db: DbSession, user: CurrentUser) -> Response:
    """Delete a manual payment and recompute its bill."""
    payment_service.delete_manual_payment(db, user, payment_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
