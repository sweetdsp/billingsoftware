"""Authentication business logic (Module 1).

All functions take a sync ``Session`` and commit their own unit of work. Opaque tokens
(refresh / reset / verification) are only ever stored as SHA-256 hashes, and are never
logged.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.auth.google import OAUTH_PROVIDER, GoogleUserInfo
from app.auth.jwt import create_access_token
from app.auth.security import generate_token, hash_password, hash_token, verify_password
from app.config import settings
from app.enums import EmailTemplate
from app.exceptions import BadRequestError, ConflictError, ForbiddenError, UnauthorizedError
from app.models import EmailVerificationToken, PasswordResetToken, RefreshToken, User
from app.schemas.auth import TokenPair, UpdateMeRequest
from app.services import email_service

logger = logging.getLogger(__name__)

EMAIL_VERIFICATION_TTL = timedelta(hours=24)
PASSWORD_RESET_TTL = timedelta(hours=1)


def _now() -> datetime:
    return datetime.now(UTC)


def normalize_email(email: str) -> str:
    """Canonical form used for storage and lookup: stripped + lowercased."""
    return email.strip().lower()


def get_user_by_email(db: Session, email: str) -> User | None:
    """Look a user up by (normalized) email."""
    return db.scalar(select(User).where(User.email == normalize_email(email)))


def _ensure_active(user: User) -> None:
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated", code="inactive")


def _revoke_all_refresh_tokens(db: Session, user_id: int) -> None:
    db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked.is_(False))
        .values(revoked=True)
    )


# --------------------------------------------------------------------------- emails


def _send_verification_email(db: Session, user: User) -> None:
    token = generate_token()
    db.add(
        EmailVerificationToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=_now() + EMAIL_VERIFICATION_TTL,
        )
    )
    db.flush()
    email_service.send_email(
        db,
        to=user.email,
        template=EmailTemplate.VERIFY_EMAIL,
        context={
            "full_name": user.full_name,
            "verify_url": f"{settings.APP_BASE_URL}/verify-email?token={token}",
            "expires_hours": int(EMAIL_VERIFICATION_TTL.total_seconds() // 3600),
        },
        user_id=user.id,
    )


def _send_welcome_email(db: Session, user: User) -> None:
    email_service.send_email(
        db,
        to=user.email,
        template=EmailTemplate.WELCOME,
        context={"full_name": user.full_name, "dashboard_url": f"{settings.APP_BASE_URL}/"},
        user_id=user.id,
    )


# --------------------------------------------------------------------------- register / verify


def register(db: Session, *, email: str, password: str, full_name: str | None) -> User:
    """Create an unverified account and email a verification link.

    Raises:
        ConflictError(code="email_taken"): the email is already registered.
    """
    normalized = normalize_email(email)
    if get_user_by_email(db, normalized) is not None:
        raise ConflictError("An account with this email already exists", code="email_taken")
    user = User(
        email=normalized,
        hashed_password=hash_password(password),
        full_name=full_name or None,
        is_active=True,
        is_verified=False,
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError as exc:  # concurrent registration with the same email
        db.rollback()
        raise ConflictError(
            "An account with this email already exists", code="email_taken"
        ) from exc
    _send_verification_email(db, user)
    db.commit()
    db.refresh(user)
    logger.info("User registered (user_id=%s)", user.id)
    return user


def verify_email(db: Session, token: str) -> User:
    """Consume an email-verification token and mark the user verified.

    Raises:
        BadRequestError(code="invalid_token"): unknown, used or expired token.
    """
    record = db.scalar(
        select(EmailVerificationToken).where(EmailVerificationToken.token_hash == hash_token(token))
    )
    now = _now()
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise BadRequestError("Verification link is invalid or has expired", code="invalid_token")
    user = db.get(User, record.user_id)
    if user is None:
        raise BadRequestError("Verification link is invalid or has expired", code="invalid_token")
    record.used_at = now
    newly_verified = not user.is_verified
    user.is_verified = True
    if newly_verified:
        _send_welcome_email(db, user)
    db.commit()
    db.refresh(user)
    logger.info("Email verified (user_id=%s)", user.id)
    return user


# --------------------------------------------------------------------------- login / tokens


def authenticate(db: Session, *, email: str, password: str) -> User:
    """Check email + password.

    Raises:
        UnauthorizedError(code="invalid_credentials"): unknown email or wrong password
            (deliberately indistinguishable).
        ForbiddenError(code="inactive"): correct credentials but the account is deactivated.
    """
    user = get_user_by_email(db, email)
    hashed = user.hashed_password if user is not None else None
    if not verify_password(password, hashed) or user is None:
        raise UnauthorizedError("Incorrect email or password", code="invalid_credentials")
    _ensure_active(user)
    return user


def issue_token_pair(db: Session, user: User) -> TokenPair:
    """Create a new access token and a new (hashed, stored) refresh token. Commits."""
    refresh_token = generate_token()
    db.add(
        RefreshToken(
            user_id=user.id,
            token_hash=hash_token(refresh_token),
            expires_at=_now() + timedelta(days=settings.REFRESH_TOKEN_EXPIRE_DAYS),
            revoked=False,
        )
    )
    db.commit()
    return TokenPair(access_token=create_access_token(user.id), refresh_token=refresh_token)


def login(db: Session, *, email: str, password: str) -> TokenPair:
    """Authenticate and issue a token pair (unverified users may log in)."""
    user = authenticate(db, email=email, password=password)
    logger.info("User logged in (user_id=%s)", user.id)
    return issue_token_pair(db, user)


def refresh(db: Session, refresh_token: str) -> TokenPair:
    """Rotate a refresh token: revoke the presented one and issue a new pair.

    Presenting an already-revoked token is treated as theft: every refresh token of that
    user is revoked.

    Raises:
        UnauthorizedError(code="invalid_token"): unknown, revoked or expired token.
        ForbiddenError(code="inactive"): the user has been deactivated.
    """
    record = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if record is None:
        raise UnauthorizedError("Invalid refresh token", code="invalid_token")
    if record.revoked:
        logger.warning(
            "Refresh token reuse detected; revoking all sessions (user_id=%s)", record.user_id
        )
        _revoke_all_refresh_tokens(db, record.user_id)
        db.commit()
        raise UnauthorizedError("Invalid refresh token", code="invalid_token")
    if record.expires_at <= _now():
        record.revoked = True
        db.commit()
        raise UnauthorizedError("Refresh token has expired", code="invalid_token")
    user = db.get(User, record.user_id)
    if user is None:
        raise UnauthorizedError("Invalid refresh token", code="invalid_token")
    record.revoked = True
    if not user.is_active:
        db.commit()
        _ensure_active(user)
    return issue_token_pair(db, user)


def logout(db: Session, refresh_token: str) -> None:
    """Revoke a refresh token. Idempotent: unknown tokens are ignored."""
    record = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(refresh_token))
    )
    if record is not None and not record.revoked:
        record.revoked = True
        db.commit()
        logger.info("User logged out (user_id=%s)", record.user_id)


# --------------------------------------------------------------------------- password reset


def forgot_password(db: Session, email: str) -> None:
    """Email a single-use reset link if the account exists. Always succeeds silently.

    OAuth-only users (no password) also get a link, which lets them set a password.
    """
    user = get_user_by_email(db, email)
    if user is None or not user.is_active:
        logger.info("Password reset requested for unknown or inactive account")
        return
    token = generate_token()
    db.add(
        PasswordResetToken(
            user_id=user.id,
            token_hash=hash_token(token),
            expires_at=_now() + PASSWORD_RESET_TTL,
        )
    )
    db.flush()
    email_service.send_email(
        db,
        to=user.email,
        template=EmailTemplate.RESET_PASSWORD,
        context={
            "full_name": user.full_name,
            "reset_url": f"{settings.APP_BASE_URL}/reset-password?token={token}",
            "expires_minutes": int(PASSWORD_RESET_TTL.total_seconds() // 60),
        },
        user_id=user.id,
    )
    db.commit()
    logger.info("Password reset email issued (user_id=%s)", user.id)


def reset_password(db: Session, token: str, new_password: str) -> None:
    """Consume a reset token, set the new password and revoke every refresh token.

    Raises:
        BadRequestError(code="invalid_token"): unknown, used or expired token.
    """
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token))
    )
    now = _now()
    if record is None or record.used_at is not None or record.expires_at <= now:
        raise BadRequestError("Reset link is invalid or has expired", code="invalid_token")
    user = db.get(User, record.user_id)
    if user is None:
        raise BadRequestError("Reset link is invalid or has expired", code="invalid_token")
    record.used_at = now
    user.hashed_password = hash_password(new_password)
    # Receiving the link proves control of the mailbox.
    user.is_verified = True
    _revoke_all_refresh_tokens(db, user.id)
    db.commit()
    logger.info("Password reset completed (user_id=%s)", user.id)


# --------------------------------------------------------------------------- profile


def update_me(db: Session, user: User, data: UpdateMeRequest) -> User:
    """Update the current user's name and/or password.

    Changing an existing password requires the correct ``current_password``. OAuth-only
    users (no password yet) may set one without it.

    Raises:
        BadRequestError(code="invalid_current_password"): missing/wrong current password.
    """
    fields = data.model_fields_set
    if "full_name" in fields:
        user.full_name = data.full_name or None
    if data.new_password is not None:
        if user.hashed_password is not None and not verify_password(
            data.current_password or "", user.hashed_password
        ):
            raise BadRequestError("Current password is incorrect", code="invalid_current_password")
        user.hashed_password = hash_password(data.new_password)
        logger.info("Password changed (user_id=%s)", user.id)
    db.commit()
    db.refresh(user)
    return user


# --------------------------------------------------------------------------- Google


def google_login_or_register(db: Session, info: GoogleUserInfo) -> User:
    """Find or create the user for a verified Google identity.

    Lookup order: (provider, sub) -> verified email (links the account) -> new user.

    Raises:
        ForbiddenError(code="inactive"): the matched account is deactivated.
    """
    user = db.scalar(
        select(User).where(User.oauth_provider == OAUTH_PROVIDER, User.oauth_sub == info.sub)
    )
    created = False
    if user is None:
        user = get_user_by_email(db, info.email)
        if user is not None:
            _ensure_active(user)
            user.oauth_provider = OAUTH_PROVIDER
            user.oauth_sub = info.sub
            logger.info("Linked Google identity to existing user (user_id=%s)", user.id)
        else:
            user = User(
                email=normalize_email(info.email),
                hashed_password=None,
                full_name=info.name,
                is_active=True,
                is_verified=True,
                oauth_provider=OAUTH_PROVIDER,
                oauth_sub=info.sub,
            )
            db.add(user)
            created = True
    _ensure_active(user)
    user.is_verified = True
    if user.full_name is None and info.name:
        user.full_name = info.name
    db.flush()
    if created:
        _send_welcome_email(db, user)
        logger.info("User registered via Google (user_id=%s)", user.id)
    db.commit()
    db.refresh(user)
    return user
