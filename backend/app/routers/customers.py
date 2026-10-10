"""Customers API (Module 3): ``/api/v1/customers``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import User
from app.schemas.base import Page, PageParams
from app.schemas.customer import (
    CustomerCreate,
    CustomerDetail,
    CustomerListItem,
    CustomerOut,
    CustomerUpdate,
)
from app.services import customer_service

router = APIRouter(prefix="/customers", tags=["customers"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=Page[CustomerListItem])
def list_customers(
    db: DbSession,
    user: CurrentUser,
    params: Annotated[PageParams, Depends()],
    q: Annotated[
        str | None,
        Query(max_length=200, description="Search name, email or company (case-insensitive)"),
    ] = None,
    active: Annotated[
        bool, Query(description="true = active customers (default), false = archived")
    ] = True,
) -> Page[CustomerListItem]:
    """List the user's customers with ``balanceDue`` and ``activePlanCount`` per row."""
    items, total = customer_service.list_customers(db, user, q, active, params)
    return Page[CustomerListItem](
        items=items, total=total, page=params.page, page_size=params.page_size
    )


@router.post("", response_model=CustomerOut, status_code=status.HTTP_201_CREATED)
def create_customer(payload: CustomerCreate, db: DbSession, user: CurrentUser) -> CustomerOut:
    """Create a customer (409 ``customer_email_exists`` for a duplicate active email)."""
    customer = customer_service.create_customer(db, user, payload)
    return CustomerOut.model_validate(customer)


@router.get("/{customer_id}", response_model=CustomerDetail)
def get_customer(customer_id: int, db: DbSession, user: CurrentUser) -> CustomerDetail:
    """Customer detail with balance due, plans, recent bills and recent payments."""
    return customer_service.get_customer_detail(db, user, customer_id)


@router.put("/{customer_id}", response_model=CustomerOut)
def update_customer(
    customer_id: int, payload: CustomerUpdate, db: DbSession, user: CurrentUser
) -> CustomerOut:
    """Update a customer (only fields sent). ``isActive: true`` un-archives."""
    customer = customer_service.update_customer(db, user, customer_id, payload)
    return CustomerOut.model_validate(customer)


@router.delete("/{customer_id}", status_code=status.HTTP_204_NO_CONTENT, response_class=Response)
def archive_customer(customer_id: int, db: DbSession, user: CurrentUser) -> Response:
    """Archive (soft-delete). 409 ``customer_has_active_plans`` if active/paused plans exist."""
    customer_service.archive_customer(db, user, customer_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
