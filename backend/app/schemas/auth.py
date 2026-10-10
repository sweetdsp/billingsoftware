"""Request/response schemas for Module 1: Authentication (camelCase over the wire)."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import EmailStr, Field, StringConstraints, computed_field

from app.schemas.base import APIModel

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128

Password = Annotated[str, Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)]
"""A new password chosen by the user."""

FullName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=255)]
OpaqueToken = Annotated[str, Field(min_length=1, max_length=512)]


class RegisterRequest(APIModel):
    """``POST /auth/register`` body."""

    email: EmailStr
    password: Password
    full_name: FullName | None = None


class LoginRequest(APIModel):
    """``POST /auth/login`` body (JSON, not an OAuth2 form)."""

    email: EmailStr
    password: Annotated[str, Field(min_length=1, max_length=PASSWORD_MAX_LENGTH)]


class TokenPair(APIModel):
    """Access + refresh tokens issued on login / refresh."""

    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"  # noqa: S105 - OAuth token type, not a secret


class RefreshRequest(APIModel):
    """``POST /auth/refresh`` body."""

    refresh_token: OpaqueToken


class LogoutRequest(APIModel):
    """``POST /auth/logout`` body."""

    refresh_token: OpaqueToken


class VerifyEmailRequest(APIModel):
    """``POST /auth/verify-email`` body."""

    token: OpaqueToken


class ForgotPasswordRequest(APIModel):
    """``POST /auth/forgot-password`` body."""

    email: EmailStr


class ResetPasswordRequest(APIModel):
    """``POST /auth/reset-password`` body."""

    token: OpaqueToken
    new_password: Password


class UpdateMeRequest(APIModel):
    """``PUT /auth/me`` body. ``currentPassword`` is required to change an existing password."""

    full_name: FullName | None = None
    current_password: Annotated[str, Field(max_length=PASSWORD_MAX_LENGTH)] | None = None
    new_password: Password | None = None


class MessageResponse(APIModel):
    """Generic acknowledgement."""

    message: str


class UserOut(APIModel):
    """Public view of the current user."""

    id: int
    email: str
    full_name: str | None
    is_active: bool
    is_verified: bool
    is_admin: bool
    oauth_provider: str | None
    created_at: datetime
    # Read from the ORM object but never serialized; only exposed as ``hasPassword``.
    hashed_password: str | None = Field(default=None, exclude=True, repr=False)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def has_password(self) -> bool:
        """True if the user can sign in with a password (False for Google-only accounts)."""
        return self.hashed_password is not None
