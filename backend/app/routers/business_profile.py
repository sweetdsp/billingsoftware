"""Business profile endpoints (``/api/v1/business-profile``)."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.models import BusinessProfile, User
from app.schemas.business_profile import BusinessProfileIn, BusinessProfileOut
from app.services import business_profile_service

router = APIRouter(prefix="/business-profile", tags=["business-profile"])


@router.get("", response_model=BusinessProfileOut)
def get_business_profile(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessProfile:
    """Return the current user's business profile (404 ``profile_not_found`` if none)."""
    return business_profile_service.get_profile(db, current_user)


@router.put("", response_model=BusinessProfileOut)
def upsert_business_profile(
    payload: BusinessProfileIn,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> BusinessProfile:
    """Create or update the current user's business profile."""
    return business_profile_service.upsert_profile(db, current_user, payload)
