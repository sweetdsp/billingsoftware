"""Google OAuth 2.0 (authorization-code flow) helpers.

CSRF protection: ``/auth/google`` issues a signed ``state`` value, stores it in a short-lived
HttpOnly cookie *and* sends it to Google; the callback requires both to match and the
signature/expiry to verify. State format: ``<nonce>.<unix_ts>.<hex hmac-sha256>``.

Network calls live in :func:`exchange_code_for_tokens` and :func:`fetch_userinfo` so tests
can monkeypatch them (``app.auth.google.exchange_code_for_tokens`` etc.).
"""

from __future__ import annotations

import hashlib
import hmac
import logging
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - public endpoint
GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo"
OAUTH_PROVIDER = "google"
STATE_COOKIE_NAME = "oauth_state"
STATE_MAX_AGE_SECONDS = 600
HTTP_TIMEOUT_SECONDS = 10.0


class GoogleOAuthError(Exception):
    """Any failure in the Google OAuth flow (never shown verbatim to the user)."""


@dataclass(frozen=True)
class GoogleUserInfo:
    """The verified identity returned by Google."""

    sub: str
    email: str
    name: str | None


def is_configured() -> bool:
    """True when Google OAuth credentials are present."""
    return bool(settings.GOOGLE_CLIENT_ID and settings.GOOGLE_CLIENT_SECRET.get_secret_value())


def _sign(message: str) -> str:
    key = settings.SECRET_KEY.get_secret_value().encode("utf-8")
    return hmac.new(key, f"google-oauth-state:{message}".encode(), hashlib.sha256).hexdigest()


def create_state(now: float | None = None) -> str:
    """Return a new signed, timestamped ``state`` value."""
    issued_at = int(now if now is not None else time.time())
    message = f"{secrets.token_urlsafe(16)}.{issued_at}"
    return f"{message}.{_sign(message)}"


def verify_state(
    state: str | None, *, max_age: int = STATE_MAX_AGE_SECONDS, now: float | None = None
) -> bool:
    """Check signature (constant-time) and age of a ``state`` value."""
    if not state:
        return False
    parts = state.split(".")
    if len(parts) != 3:
        return False
    nonce, issued_raw, signature = parts
    if not hmac.compare_digest(_sign(f"{nonce}.{issued_raw}"), signature):
        return False
    try:
        issued_at = int(issued_raw)
    except ValueError:
        return False
    current = now if now is not None else time.time()
    return 0 <= current - issued_at <= max_age


def build_authorization_url(state: str) -> str:
    """Return the Google consent-screen URL for ``state``."""
    params = {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "redirect_uri": settings.GOOGLE_REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email profile",
        "state": state,
        "access_type": "online",
        "prompt": "select_account",
    }
    return f"{GOOGLE_AUTH_URL}?{urlencode(params)}"


def exchange_code_for_tokens(code: str) -> dict[str, Any]:
    """Exchange an authorization ``code`` for Google tokens (network call)."""
    response = httpx.post(
        GOOGLE_TOKEN_URL,
        data={
            "code": code,
            "client_id": settings.GOOGLE_CLIENT_ID,
            "client_secret": settings.GOOGLE_CLIENT_SECRET.get_secret_value(),
            "redirect_uri": settings.GOOGLE_REDIRECT_URI,
            "grant_type": "authorization_code",
        },
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if response.status_code != httpx.codes.OK:
        raise GoogleOAuthError(f"Token exchange failed with HTTP {response.status_code}")
    data: dict[str, Any] = response.json()
    return data


def fetch_userinfo(access_token: str) -> dict[str, Any]:
    """Fetch the OpenID Connect userinfo for a Google access token (network call)."""
    response = httpx.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=HTTP_TIMEOUT_SECONDS,
    )
    if response.status_code != httpx.codes.OK:
        raise GoogleOAuthError(f"Userinfo request failed with HTTP {response.status_code}")
    data: dict[str, Any] = response.json()
    return data


def get_google_user(code: str) -> GoogleUserInfo:
    """Run the code exchange + userinfo fetch and return a verified identity.

    Raises:
        GoogleOAuthError: network/HTTP failure, missing fields, or unverified email.
    """
    try:
        tokens = exchange_code_for_tokens(code)
        access_token = tokens.get("access_token")
        if not isinstance(access_token, str) or not access_token:
            raise GoogleOAuthError("No access_token in Google token response")
        info = fetch_userinfo(access_token)
    except httpx.HTTPError as exc:
        raise GoogleOAuthError(f"Google request failed: {type(exc).__name__}") from exc

    sub = info.get("sub")
    email = info.get("email")
    if not isinstance(sub, str) or not sub or not isinstance(email, str) or not email:
        raise GoogleOAuthError("Google userinfo missing sub/email")
    if info.get("email_verified") is not True:
        raise GoogleOAuthError("Google email is not verified")
    name = info.get("name")
    return GoogleUserInfo(
        sub=sub,
        email=email.strip().lower(),
        name=name if isinstance(name, str) and name else None,
    )
