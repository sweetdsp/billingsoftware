"""Shared FastAPI dependencies.

- :func:`get_db` - re-exported from :mod:`app.database` (one Session per request).
- :func:`get_current_user` - resolves the user from an ``Authorization: Bearer`` access token.
- :func:`require_admin` - admin-only guard.
"""

from __future__ import annotations

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.jwt import decode_access_token
from app.database import get_db
from app.exceptions import ForbiddenError, UnauthorizedError
from app.models import User

__all__ = ["bearer_scheme", "get_current_user", "get_db", "require_admin"]

# auto_error=False so a missing header yields our contract-shaped 401 (not FastAPI's default).
bearer_scheme = HTTPBearer(auto_error=False, description="JWT access token")


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    """Resolve the authenticated user from the ``Authorization: Bearer`` access token.

    Raises:
        UnauthorizedError: token missing/invalid/expired, or the user no longer exists.
        ForbiddenError(code="inactive"): the user has been deactivated.
    """
    if credentials is None or not credentials.credentials:
        raise UnauthorizedError("Not authenticated", code="not_authenticated")
    user_id = decode_access_token(credentials.credentials)
    user = db.get(User, user_id)
    if user is None:
        raise UnauthorizedError("User not found", code="invalid_token")
    if not user.is_active:
        raise ForbiddenError("This account has been deactivated", code="inactive")
    return user


def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Allow only admin users through.

    Raises:
        ForbiddenError: the current user is not an admin.
    """
    if not current_user.is_admin:
        raise ForbiddenError("Admin access required")
    return current_user
