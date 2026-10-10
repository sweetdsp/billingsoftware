"""Business profile: one per user, created on onboarding and updated in Settings."""

from __future__ import annotations

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import FilePurpose
from app.exceptions import BadRequestError, NotFoundError
from app.models import BusinessProfile, UploadedFile, User
from app.schemas.business_profile import BusinessProfileIn

logger = logging.getLogger(__name__)


def find_profile(db: Session, user_id: int) -> BusinessProfile | None:
    """Return the user's profile or ``None`` (no locking)."""
    return db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user_id))


def get_profile(db: Session, user: User) -> BusinessProfile:
    """Return the user's profile; 404 ``profile_not_found`` before onboarding."""
    profile = find_profile(db, user.id)
    if profile is None:
        raise NotFoundError("Business profile not set up yet", code="profile_not_found")
    return profile


def _check_logo(db: Session, user: User, logo_file_id: int) -> None:
    upload = db.scalar(
        select(UploadedFile).where(UploadedFile.id == logo_file_id, UploadedFile.user_id == user.id)
    )
    if upload is None or upload.purpose is not FilePurpose.LOGO:
        raise BadRequestError(
            "logoFileId must reference one of your uploaded logo files", code="invalid_logo"
        )


def upsert_profile(db: Session, user: User, payload: BusinessProfileIn) -> BusinessProfile:
    """Create or fully update the user's profile.

    ``next_bill_number`` is server-managed and never changed here.
    """
    if payload.logo_file_id is not None:
        _check_logo(db, user, payload.logo_file_id)

    profile = find_profile(db, user.id)
    created = profile is None
    if profile is None:
        profile = BusinessProfile(user_id=user.id)
        db.add(profile)

    profile.business_name = payload.business_name
    profile.address = payload.address
    profile.phone = payload.phone
    profile.email = str(payload.email) if payload.email is not None else None
    profile.tax_id = payload.tax_id
    profile.default_currency = payload.default_currency
    profile.bill_number_prefix = payload.bill_number_prefix
    profile.default_due_days = payload.default_due_days
    profile.default_tax_rate = payload.default_tax_rate
    profile.reminder_days_after_due = list(payload.reminder_days_after_due)
    profile.footer_note = payload.footer_note
    profile.logo_file_id = payload.logo_file_id

    db.commit()
    db.refresh(profile)
    logger.info("%s business profile for user %s", "Created" if created else "Updated", user.id)
    return profile
