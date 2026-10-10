"""Pure unit tests for auth primitives (no database fixtures)."""

from __future__ import annotations

import time
from datetime import UTC, datetime, timedelta

import pytest
from freezegun import freeze_time
from jose import jwt

from app.auth import google
from app.auth.jwt import create_access_token, decode_access_token
from app.auth.security import generate_token, hash_password, hash_token, verify_password
from app.config import settings
from app.enums import EmailTemplate
from app.exceptions import UnauthorizedError
from app.services.email_service import render_email

# ----------------------------------------------------------------------------- passwords


def test_hash_and_verify_password() -> None:
    hashed = hash_password("correct horse battery")
    assert hashed != "correct horse battery"
    assert hashed.startswith("$2")
    assert verify_password("correct horse battery", hashed)
    assert not verify_password("wrong password", hashed)


def test_hash_is_salted() -> None:
    assert hash_password("same-password") != hash_password("same-password")


def test_verify_password_handles_none_and_garbage() -> None:
    assert verify_password("anything", None) is False
    assert verify_password("anything", "") is False
    assert verify_password("anything", "not-a-bcrypt-hash") is False


def test_long_passwords_are_fully_significant() -> None:
    """Passwords beyond bcrypt's 72-byte limit still work and are not truncated."""
    base = "x" * 100
    hashed = hash_password(base + "A")
    assert verify_password(base + "A", hashed)
    assert not verify_password(base + "B", hashed)


def test_unicode_password() -> None:
    hashed = hash_password("pässwörd-密码-🔐")
    assert verify_password("pässwörd-密码-🔐", hashed)


# ----------------------------------------------------------------------------- opaque tokens


def test_generate_token_is_random_and_urlsafe() -> None:
    tokens = {generate_token() for _ in range(50)}
    assert len(tokens) == 50
    for token in tokens:
        assert len(token) >= 43
        assert all(c.isalnum() or c in "-_" for c in token)


def test_hash_token_is_deterministic_sha256() -> None:
    assert hash_token("abc") == hash_token("abc")
    assert hash_token("abc") != hash_token("abd")
    assert hash_token("abc") == "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"


# ----------------------------------------------------------------------------- JWT


def test_access_token_roundtrip() -> None:
    token = create_access_token(42)
    assert decode_access_token(token) == 42
    claims = jwt.get_unverified_claims(token)
    assert claims["sub"] == "42"
    assert claims["type"] == "access"
    assert "iat" in claims and "exp" in claims


def test_access_token_expires() -> None:
    with freeze_time(
        datetime.now(UTC) - timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES + 5)
    ):
        token = create_access_token(1)
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_access_token_valid_until_expiry() -> None:
    start = datetime(2026, 1, 1, 12, 0, tzinfo=UTC)
    with freeze_time(start):
        token = create_access_token(7)
    with freeze_time(start + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES - 1)):
        assert decode_access_token(token) == 7
    with freeze_time(start + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES + 1)):
        with pytest.raises(UnauthorizedError):
            decode_access_token(token)


def test_wrong_token_type_rejected() -> None:
    token = jwt.encode(
        {"sub": "1", "type": "refresh", "exp": int(time.time()) + 600},
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_wrong_signature_rejected() -> None:
    token = jwt.encode(
        {"sub": "1", "type": "access", "exp": int(time.time()) + 600},
        "some-other-secret",
        algorithm="HS256",
    )
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)


def test_non_numeric_subject_and_garbage_rejected() -> None:
    token = jwt.encode(
        {"sub": "abc", "type": "access", "exp": int(time.time()) + 600},
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    with pytest.raises(UnauthorizedError):
        decode_access_token(token)
    with pytest.raises(UnauthorizedError):
        decode_access_token("not.a.jwt")


def test_alg_none_rejected() -> None:
    token = jwt.encode(
        {"sub": "1", "type": "access", "exp": int(time.time()) + 600},
        settings.SECRET_KEY.get_secret_value(),
        algorithm=settings.ALGORITHM,
    )
    header, payload, _sig = token.split(".")
    import base64
    import json

    none_header = base64.urlsafe_b64encode(json.dumps({"alg": "none"}).encode()).rstrip(b"=")
    forged = f"{none_header.decode()}.{payload}."
    assert header != none_header.decode()
    with pytest.raises(UnauthorizedError):
        decode_access_token(forged)


# ----------------------------------------------------------------------------- OAuth state


def test_state_sign_and_verify() -> None:
    state = google.create_state()
    assert google.verify_state(state)
    assert google.create_state() != state


def test_state_tamper_rejected() -> None:
    state = google.create_state()
    nonce, issued, sig = state.split(".")
    assert not google.verify_state(f"{nonce}x.{issued}.{sig}")
    assert not google.verify_state(f"{nonce}.{int(issued) + 1}.{sig}")
    assert not google.verify_state(f"{nonce}.{issued}.{'0' * len(sig)}")
    assert not google.verify_state("")
    assert not google.verify_state(None)
    assert not google.verify_state("only.two")
    assert not google.verify_state("a.b.c.d")


def test_state_expiry() -> None:
    issued = 1_700_000_000.0
    state = google.create_state(now=issued)
    assert google.verify_state(state, now=issued + 60)
    assert google.verify_state(state, now=issued + google.STATE_MAX_AGE_SECONDS)
    assert not google.verify_state(state, now=issued + google.STATE_MAX_AGE_SECONDS + 1)
    assert not google.verify_state(state, now=issued - 10)  # issued in the future


def test_authorization_url_contains_state_and_client() -> None:
    url = google.build_authorization_url("the-state")
    assert url.startswith(google.GOOGLE_AUTH_URL)
    assert "state=the-state" in url
    assert "scope=openid+email+profile" in url
    assert "response_type=code" in url


def test_get_google_user_requires_verified_email(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google, "exchange_code_for_tokens", lambda code: {"access_token": "t"})
    monkeypatch.setattr(
        google,
        "fetch_userinfo",
        lambda token: {"sub": "123", "email": "X@Example.com", "email_verified": False},
    )
    with pytest.raises(google.GoogleOAuthError):
        google.get_google_user("code")

    monkeypatch.setattr(
        google,
        "fetch_userinfo",
        lambda token: {"sub": "123", "email": " X@Example.com", "email_verified": True},
    )
    info = google.get_google_user("code")
    assert info == google.GoogleUserInfo(sub="123", email="x@example.com", name=None)


def test_get_google_user_missing_access_token(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google, "exchange_code_for_tokens", lambda code: {"error": "bad"})
    with pytest.raises(google.GoogleOAuthError):
        google.get_google_user("code")


# ----------------------------------------------------------------------------- email rendering


@pytest.mark.parametrize(
    "template",
    list(EmailTemplate),
)
def test_every_email_template_renders(template: EmailTemplate) -> None:
    context = {
        "full_name": "Ada",
        "verify_url": "https://app.test/verify-email?token=abc",
        "expires_hours": 24,
        "reset_url": "https://app.test/reset-password?token=abc",
        "expires_minutes": 60,
        "dashboard_url": "https://app.test/",
        "business_name": "Acme & Co",
        "customer_name": "Bob",
        "bill_number": "BM-0001",
        "total": "1250.00",
        "currency": "USD",
        "due_date": "2026-10-17",
        "pay_url": "https://app.test/pay/xyz",
        "amount_paid": "1250.00",
    }
    rendered = render_email(template, context)
    assert rendered.subject
    assert "\n" not in rendered.subject
    assert "<html" in rendered.html


def test_email_rendering_escapes_html_and_plain_subject() -> None:
    rendered = render_email(
        EmailTemplate.BILL_SENT,
        {
            "business_name": "Acme & Co",
            "customer_name": "<script>alert(1)</script>",
            "bill_number": "BM-0001",
            "total": "10.00",
            "currency": "USD",
            "due_date": "2026-10-17",
            "pay_url": "https://app.test/pay/xyz",
        },
    )
    assert "<script>" not in rendered.html
    assert "&lt;script&gt;" in rendered.html
    assert rendered.subject == "Bill BM-0001 from Acme & Co"
