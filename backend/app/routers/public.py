"""Unauthenticated customer-facing endpoints: ``/api/v1/public``.

NOTE: no ``from __future__ import annotations`` here - slowapi's ``@limiter.limit`` wrapper
breaks FastAPI's annotation resolution.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.rate_limit import limiter
from app.schemas.bill import PublicBillOut
from app.services import bill_service

router = APIRouter(prefix="/public", tags=["public"])

PUBLIC_RATE_LIMIT = "60/minute"


@router.get("/bills/{public_token}", response_model=PublicBillOut)
@limiter.limit(PUBLIC_RATE_LIMIT)
def get_public_bill(
    request: Request, public_token: str, db: Annotated[Session, Depends(get_db)]
) -> PublicBillOut:
    """Read-only bill for the customer (404 for unknown tokens and unsent drafts)."""
    return bill_service.get_public_bill(db, public_token)
