"""Module 1: Authentication routes (mounted at ``/api/v1/auth``).

Endpoints are plain ``def`` (not ``async def``): every handler uses the synchronous
SQLAlchemy ``Session`` and (for Google) a blocking ``httpx`` call, so FastAPI runs them in
its threadpool instead of blocking the event loop.

NOTE: no ``from __future__ import annotations`` here - slowapi's ``@limiter.limit`` wrapper
would make FastAPI resolve string annotations against slowapi's module globals.
"""

import logging
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, Query, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.auth import google
from app.config import settings
from app.dependencies import get_current_user, get_db
from app.exceptions import AppError
from app.models import User
from app.rate_limit import limiter
from app.schemas.auth import (
    ForgotPasswordRequest,
    LoginRequest,
    LogoutRequest,
    MessageResponse,
    RefreshRequest,
    RegisterRequest,
    ResetPasswordRequest,
    TokenPair,
    UpdateMeRequest,
    UserOut,
    VerifyEmailRequest,
)
from app.services import auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

AUTH_RATE_LIMIT = "10/minute"
STATE_COOKIE_PATH = "/api/v1/auth/google"


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
@limiter.limit(AUTH_RATE_LIMIT)
def register(request: Request, body: RegisterRequest, db: Session = Depends(get_db)) -> User:
    """Create an account and send a verification email."""
    return auth_service.register(
        db, email=body.email, password=body.password, full_name=body.full_name
    )


@router.post("/verify-email", response_model=UserOut)
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)) -> User:
    """Verify an email address with the token from the verification email."""
    return auth_service.verify_email(db, body.token)


@router.post("/login", response_model=TokenPair)
@limiter.limit(AUTH_RATE_LIMIT)
def login(request: Request, body: LoginRequest, db: Session = Depends(get_db)) -> TokenPair:
    """Exchange email + password for an access/refresh token pair."""
    return auth_service.login(db, email=body.email, password=body.password)


@router.post("/refresh", response_model=TokenPair)
def refresh(body: RefreshRequest, db: Session = Depends(get_db)) -> TokenPair:
    """Rotate a refresh token and return a new token pair."""
    return auth_service.refresh(db, body.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(body: LogoutRequest, db: Session = Depends(get_db)) -> None:
    """Revoke a refresh token (idempotent)."""
    auth_service.logout(db, body.refresh_token)


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit(AUTH_RATE_LIMIT)
def forgot_password(
    request: Request, body: ForgotPasswordRequest, db: Session = Depends(get_db)
) -> MessageResponse:
    """Email a password-reset link. Always 200 so account existence is not revealed."""
    auth_service.forgot_password(db, body.email)
    return MessageResponse(
        message="If an account exists for that email, a password reset link has been sent."
    )


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit(AUTH_RATE_LIMIT)
def reset_password(
    request: Request, body: ResetPasswordRequest, db: Session = Depends(get_db)
) -> MessageResponse:
    """Set a new password using a single-use reset token (signs out all sessions)."""
    auth_service.reset_password(db, body.token, body.new_password)
    return MessageResponse(message="Your password has been reset. Please sign in.")


@router.get("/me", response_model=UserOut)
def read_me(current_user: User = Depends(get_current_user)) -> User:
    """Return the current user."""
    return current_user


@router.put("/me", response_model=UserOut)
def update_me(
    body: UpdateMeRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    """Update the current user's name and/or password."""
    return auth_service.update_me(db, current_user, body)


def _oauth_failure_redirect() -> RedirectResponse:
    response = RedirectResponse(
        f"{settings.APP_BASE_URL}/login?error=oauth_failed", status_code=status.HTTP_302_FOUND
    )
    response.delete_cookie(google.STATE_COOKIE_NAME, path=STATE_COOKIE_PATH)
    return response


@router.get("/google", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def google_start() -> RedirectResponse:
    """Redirect to Google's consent screen and set the signed ``state`` cookie."""
    if not google.is_configured():
        logger.warning("Google OAuth requested but GOOGLE_CLIENT_ID/SECRET are not set")
        return _oauth_failure_redirect()
    state = google.create_state()
    response = RedirectResponse(
        google.build_authorization_url(state), status_code=status.HTTP_302_FOUND
    )
    response.set_cookie(
        google.STATE_COOKIE_NAME,
        state,
        max_age=google.STATE_MAX_AGE_SECONDS,
        path=STATE_COOKIE_PATH,
        httponly=True,
        samesite="lax",
        secure=settings.is_production,
    )
    return response


@router.get("/google/callback", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def google_callback(
    request: Request,
    db: Session = Depends(get_db),
    code: str | None = Query(default=None, max_length=2048),
    state: str | None = Query(default=None, max_length=512),
    error: str | None = Query(default=None, max_length=256),
) -> RedirectResponse:
    """Verify ``state``, exchange the code, upsert the user and hand tokens to the SPA.

    Tokens are passed in the URL fragment (never sent to servers or logged in access logs).
    """
    cookie_state = request.cookies.get(google.STATE_COOKIE_NAME)
    if error or not code:
        logger.info("Google OAuth callback without code (error=%s)", error)
        return _oauth_failure_redirect()
    if not state or not cookie_state or state != cookie_state or not google.verify_state(state):
        logger.warning("Google OAuth callback rejected: invalid state")
        return _oauth_failure_redirect()
    try:
        info = google.get_google_user(code)
        user = auth_service.google_login_or_register(db, info)
        tokens = auth_service.issue_token_pair(db, user)
    except (google.GoogleOAuthError, AppError) as exc:
        logger.warning("Google OAuth login failed: %s", type(exc).__name__)
        db.rollback()
        return _oauth_failure_redirect()
    fragment = urlencode(
        {
            "accessToken": tokens.access_token,
            "refreshToken": tokens.refresh_token,
            "tokenType": tokens.token_type,
        }
    )
    response = RedirectResponse(
        f"{settings.APP_BASE_URL}/oauth/callback#{fragment}", status_code=status.HTTP_302_FOUND
    )
    response.delete_cookie(google.STATE_COOKIE_NAME, path=STATE_COOKIE_PATH)
    return response
