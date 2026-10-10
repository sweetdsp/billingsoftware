"""Password hashing and opaque-token helpers.

Passwords are hashed with bcrypt (the ``bcrypt`` package, not passlib). Because bcrypt
only looks at the first 72 bytes of its input (and bcrypt>=5 rejects longer input), the
password is first pre-hashed to a fixed 44-byte value: ``base64(sha256(password))``.
Base64 output never contains NUL bytes, so no entropy is lost to bcrypt's C-string rules.

Opaque tokens (refresh, password-reset, email-verification) are random
``secrets.token_urlsafe(32)`` strings; only their SHA-256 hex digest is stored.
"""

from __future__ import annotations

import base64
import hashlib
import secrets

import bcrypt

from app.config import settings

# Cheap rounds in the test suite only; production cost factor is 12.
_BCRYPT_ROUNDS = 4 if settings.ENVIRONMENT == "test" else 12

# Used to burn comparable CPU time when there is no stored hash (unknown user /
# OAuth-only account), so response timing does not reveal whether an account exists.
_DUMMY_HASH = bcrypt.hashpw(b"timing-equalizer", bcrypt.gensalt(rounds=_BCRYPT_ROUNDS))


def _prehash(plain: str) -> bytes:
    """Reduce any password to a fixed-length, NUL-free byte string for bcrypt."""
    digest = hashlib.sha256(plain.encode("utf-8")).digest()
    return base64.b64encode(digest)


def hash_password(plain: str) -> str:
    """Return a bcrypt hash (as ``str``) of ``plain``."""
    return bcrypt.hashpw(_prehash(plain), bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode("ascii")


def verify_password(plain: str, hashed: str | None) -> bool:
    """Check ``plain`` against a stored bcrypt hash in constant time.

    Returns ``False`` (after doing equivalent work) when ``hashed`` is ``None`` or malformed.
    """
    if not hashed:
        bcrypt.checkpw(_prehash(plain), _DUMMY_HASH)
        return False
    try:
        return bcrypt.checkpw(_prehash(plain), hashed.encode("ascii"))
    except ValueError:
        bcrypt.checkpw(_prehash(plain), _DUMMY_HASH)
        return False


def generate_token() -> str:
    """Return a new unguessable URL-safe token (~256 bits of entropy)."""
    return secrets.token_urlsafe(32)


def hash_token(token: str) -> str:
    """Return the SHA-256 hex digest of an opaque token (what the database stores)."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
