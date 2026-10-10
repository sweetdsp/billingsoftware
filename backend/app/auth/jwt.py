"""JWT access tokens (HS256, short-lived). Refresh tokens are opaque, see ``security``."""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.config import settings
from app.exceptions import UnauthorizedError

logger = logging.getLogger(__name__)

ACCESS_TOKEN_TYPE = "access"  # noqa: S105 - claim value, not a secret


def create_access_token(user_id: int, *, expires_delta: timedelta | None = None) -> str:
    """Create a signed access token for ``user_id``.

    Claims: ``sub`` (user id as str), ``type`` ("access"), ``iat``, ``exp``.
    """
    now = datetime.now(UTC)
    expire = now + (expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES))
    claims = {
        "sub": str(user_id),
        "type": ACCESS_TOKEN_TYPE,
        "iat": int(now.timestamp()),
        "exp": int(expire.timestamp()),
    }
    return str(
        jwt.encode(claims, settings.SECRET_KEY.get_secret_value(), algorithm=settings.ALGORITHM)
    )


def decode_access_token(token: str) -> int:
    """Validate an access token and return the user id it was issued for.

    Raises:
        UnauthorizedError: bad signature, expired, malformed, or not an access token.
    """
    try:
        payload = jwt.decode(
            token,
            settings.SECRET_KEY.get_secret_value(),
            algorithms=[settings.ALGORITHM],
            options={"require_exp": True, "require_sub": True},
        )
    except JWTError as exc:
        logger.debug("Access token rejected: %s", type(exc).__name__)
        raise UnauthorizedError("Invalid or expired token", code="invalid_token") from exc
    if payload.get("type") != ACCESS_TOKEN_TYPE:
        raise UnauthorizedError("Invalid token type", code="invalid_token")
    try:
        return int(payload["sub"])
    except (KeyError, TypeError, ValueError) as exc:
        raise UnauthorizedError("Invalid token subject", code="invalid_token") from exc
