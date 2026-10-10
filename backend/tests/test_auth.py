"""API tests for Module 1: Authentication (requires PostgreSQL, see conftest)."""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi.testclient import TestClient
from freezegun import freeze_time
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import google
from app.auth.jwt import create_access_token
from app.auth.security import hash_token
from app.config import settings
from app.enums import EmailStatus, EmailTemplate
from app.exceptions import BadRequestError
from app.models import EmailLog, PasswordResetToken, RefreshToken, User
from app.services import auth_service
from tests.conftest import TEST_PASSWORD

API = "/api/v1/auth"
NEW_PASSWORD = "Brand-new-pass-123"


def _token_from_email(payload: dict[str, Any]) -> str:
    match = re.search(r"token=([A-Za-z0-9_\-]+)", payload["html"])
    assert match, "no token link in email"
    return match.group(1)


def _register(client: TestClient, email: str = "new@example.com", **extra: Any) -> Any:
    body = {"email": email, "password": "Password-123", "fullName": "New Person", **extra}
    return client.post(f"{API}/register", json=body)


def _login(client: TestClient, email: str, password: str = TEST_PASSWORD) -> Any:
    return client.post(f"{API}/login", json={"email": email, "password": password})


# ----------------------------------------------------------------------------- register / verify


def test_register_then_verify(
    client: TestClient, db: Session, sent_emails: list[dict[str, Any]]
) -> None:
    resp = _register(client)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["email"] == "new@example.com"
    assert data["fullName"] == "New Person"
    assert data["isVerified"] is False
    assert "hashedPassword" not in data and "password" not in data

    assert len(sent_emails) == 1
    mail = sent_emails[0]
    assert mail["to"] == ["new@example.com"]
    assert f"{settings.APP_BASE_URL}/verify-email?token=" in mail["html"]
    token = _token_from_email(mail)

    log = db.scalar(select(EmailLog).where(EmailLog.to_email == "new@example.com"))
    assert log is not None
    assert log.template == EmailTemplate.VERIFY_EMAIL
    assert log.status == EmailStatus.SENT

    # Unverified users may log in.
    assert _login(client, "new@example.com", "Password-123").status_code == 200

    resp = client.post(f"{API}/verify-email", json={"token": token})
    assert resp.status_code == 200, resp.text
    assert resp.json()["isVerified"] is True
    assert sent_emails[-1]["subject"].startswith("Welcome")

    # Single use.
    resp = client.post(f"{API}/verify-email", json={"token": token})
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_token"


def test_verify_email_bad_token(client: TestClient) -> None:
    resp = client.post(f"{API}/verify-email", json={"token": "nope"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_token"


def test_register_duplicate_email_conflict(client: TestClient, user: User) -> None:
    resp = _register(client, email=user.email)
    assert resp.status_code == 409
    assert resp.json()["code"] == "email_taken"


def test_register_email_case_insensitive(client: TestClient, user: User) -> None:
    resp = _register(client, email="  OWNER@Example.COM ")
    # Leading/trailing spaces are rejected or normalized; either way no duplicate account.
    assert resp.status_code in (409, 422)
    resp = _register(client, email="OWNER@Example.COM")
    assert resp.status_code == 409

    resp = _login(client, "Owner@EXAMPLE.com")
    assert resp.status_code == 200


def test_register_stores_lowercase_email(client: TestClient, db: Session) -> None:
    resp = _register(client, email="MiXeD@Example.com")
    assert resp.status_code == 201
    assert resp.json()["email"] == "mixed@example.com"


def test_register_validation(client: TestClient) -> None:
    assert _register(client, password="short").status_code == 422
    assert _register(client, email="not-an-email").status_code == 422
    assert _register(client, password="x" * 129).status_code == 422


def test_register_email_failure_does_not_block(
    client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    def _boom(payload: dict[str, Any]) -> str:
        raise RuntimeError("resend down")

    monkeypatch.setattr("app.services.email_service._deliver", _boom)
    resp = _register(client, email="fail@example.com")
    assert resp.status_code == 201
    log = db.scalar(select(EmailLog).where(EmailLog.to_email == "fail@example.com"))
    assert log is not None
    assert log.status == EmailStatus.FAILED
    assert log.error and "resend down" in log.error


# ----------------------------------------------------------------------------- login / me


def test_login_success(client: TestClient, user: User) -> None:
    resp = _login(client, user.email)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["tokenType"] == "bearer"
    assert data["accessToken"] and data["refreshToken"]
    me = client.get(f"{API}/me", headers={"Authorization": f"Bearer {data['accessToken']}"})
    assert me.status_code == 200
    assert me.json()["id"] == user.id


def test_login_wrong_password_and_unknown_email_are_identical(
    client: TestClient, user: User
) -> None:
    bad_pw = _login(client, user.email, "wrong-password")
    unknown = _login(client, "ghost@example.com", "wrong-password")
    assert bad_pw.status_code == unknown.status_code == 401
    assert bad_pw.json() == unknown.json()
    assert bad_pw.json()["code"] == "invalid_credentials"


def test_login_oauth_only_user_fails(client: TestClient, db: Session) -> None:
    db.add(User(email="oauth@example.com", hashed_password=None, is_verified=True))
    db.commit()
    resp = _login(client, "oauth@example.com", "anything-at-all")
    assert resp.status_code == 401


def test_login_inactive_user(client: TestClient, db: Session, user: User) -> None:
    user.is_active = False
    db.commit()
    resp = _login(client, user.email)
    assert resp.status_code == 403
    assert resp.json()["code"] == "inactive"


def test_me_requires_auth(client: TestClient) -> None:
    resp = client.get(f"{API}/me")
    assert resp.status_code == 401
    resp = client.get(f"{API}/me", headers={"Authorization": "Bearer garbage"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "invalid_token"


def test_me_returns_user(client: TestClient, user: User, auth_headers: dict[str, str]) -> None:
    resp = client.get(f"{API}/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == user.email
    assert data["isVerified"] is True
    assert data["isAdmin"] is False
    assert data["oauthProvider"] is None
    assert "createdAt" in data


def test_me_inactive_user_forbidden(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    user.is_active = False
    db.commit()
    resp = client.get(f"{API}/me", headers=auth_headers)
    assert resp.status_code == 403
    assert resp.json()["code"] == "inactive"


def test_me_deleted_user_unauthorized(client: TestClient) -> None:
    headers = {"Authorization": f"Bearer {create_access_token(999_999)}"}
    assert client.get(f"{API}/me", headers=headers).status_code == 401


# ----------------------------------------------------------------------------- refresh / logout


def test_refresh_rotation_and_reuse_detection(client: TestClient, db: Session, user: User) -> None:
    first = _login(client, user.email).json()
    second_login = _login(client, user.email).json()  # another device/session

    resp = client.post(f"{API}/refresh", json={"refreshToken": first["refreshToken"]})
    assert resp.status_code == 200, resp.text
    rotated = resp.json()
    assert rotated["refreshToken"] != first["refreshToken"]

    old = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(first["refreshToken"]))
    )
    assert old is not None and old.revoked is True

    # Reusing the rotated-out token => all of the user's sessions are revoked.
    resp = client.post(f"{API}/refresh", json={"refreshToken": first["refreshToken"]})
    assert resp.status_code == 401
    for token in (rotated["refreshToken"], second_login["refreshToken"]):
        resp = client.post(f"{API}/refresh", json={"refreshToken": token})
        assert resp.status_code == 401


def test_refresh_unknown_token(client: TestClient) -> None:
    resp = client.post(f"{API}/refresh", json={"refreshToken": "does-not-exist"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "invalid_token"


def test_refresh_expired_token(client: TestClient, db: Session, user: User) -> None:
    tokens = _login(client, user.email).json()
    record = db.scalar(
        select(RefreshToken).where(RefreshToken.token_hash == hash_token(tokens["refreshToken"]))
    )
    assert record is not None
    record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db.commit()
    resp = client.post(f"{API}/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert resp.status_code == 401


def test_refresh_inactive_user(client: TestClient, db: Session, user: User) -> None:
    tokens = _login(client, user.email).json()
    user.is_active = False
    db.commit()
    resp = client.post(f"{API}/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert resp.status_code == 403
    assert resp.json()["code"] == "inactive"


def test_logout_revokes_refresh_token(client: TestClient, user: User) -> None:
    tokens = _login(client, user.email).json()
    resp = client.post(f"{API}/logout", json={"refreshToken": tokens["refreshToken"]})
    assert resp.status_code == 204
    resp = client.post(f"{API}/refresh", json={"refreshToken": tokens["refreshToken"]})
    assert resp.status_code == 401
    # Idempotent / unknown token.
    assert client.post(f"{API}/logout", json={"refreshToken": "unknown"}).status_code == 204


# ----------------------------------------------------------------------------- forgot / reset


def test_forgot_password_unknown_email_is_silent(
    client: TestClient, sent_emails: list[dict[str, Any]]
) -> None:
    resp = client.post(f"{API}/forgot-password", json={"email": "ghost@example.com"})
    assert resp.status_code == 200
    assert sent_emails == []


def test_forgot_and_reset_password(
    client: TestClient, user: User, sent_emails: list[dict[str, Any]]
) -> None:
    session = _login(client, user.email).json()

    resp = client.post(f"{API}/forgot-password", json={"email": user.email.upper()})
    assert resp.status_code == 200
    assert len(sent_emails) == 1
    assert f"{settings.APP_BASE_URL}/reset-password?token=" in sent_emails[0]["html"]
    token = _token_from_email(sent_emails[0])

    resp = client.post(f"{API}/reset-password", json={"token": token, "newPassword": NEW_PASSWORD})
    assert resp.status_code == 200, resp.text

    assert _login(client, user.email).status_code == 401
    assert _login(client, user.email, NEW_PASSWORD).status_code == 200
    # Existing sessions are revoked.
    resp = client.post(f"{API}/refresh", json={"refreshToken": session["refreshToken"]})
    assert resp.status_code == 401
    # Single use.
    resp = client.post(
        f"{API}/reset-password", json={"token": token, "newPassword": "Another-pass-456"}
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_token"


def test_reset_password_expired(db: Session, user: User, sent_emails: list[dict[str, Any]]) -> None:
    start = datetime.now(UTC)
    with freeze_time(start):
        auth_service.forgot_password(db, user.email)
    token = _token_from_email(sent_emails[-1])
    record = db.scalar(
        select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(token))
    )
    assert record is not None

    with freeze_time(start + timedelta(minutes=61)):
        with pytest.raises(BadRequestError):
            auth_service.reset_password(db, token, NEW_PASSWORD)
    with freeze_time(start + timedelta(minutes=59)):
        auth_service.reset_password(db, token, NEW_PASSWORD)


def test_reset_password_validation(client: TestClient) -> None:
    resp = client.post(f"{API}/reset-password", json={"token": "x", "newPassword": "short"})
    assert resp.status_code == 422


# ----------------------------------------------------------------------------- update me


def test_update_me_name(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.put(f"{API}/me", json={"fullName": "Renamed"}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["fullName"] == "Renamed"


def test_update_me_password_requires_current(
    client: TestClient, user: User, auth_headers: dict[str, str]
) -> None:
    resp = client.put(f"{API}/me", json={"newPassword": NEW_PASSWORD}, headers=auth_headers)
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_current_password"

    resp = client.put(
        f"{API}/me",
        json={"currentPassword": "wrong-one", "newPassword": NEW_PASSWORD},
        headers=auth_headers,
    )
    assert resp.status_code == 400

    resp = client.put(
        f"{API}/me",
        json={"currentPassword": TEST_PASSWORD, "newPassword": NEW_PASSWORD},
        headers=auth_headers,
    )
    assert resp.status_code == 200
    assert _login(client, user.email, NEW_PASSWORD).status_code == 200


def test_update_me_oauth_user_can_set_password(client: TestClient, db: Session) -> None:
    oauth_user = User(
        email="g@example.com", hashed_password=None, is_verified=True, oauth_provider="google"
    )
    db.add(oauth_user)
    db.commit()
    headers = {"Authorization": f"Bearer {create_access_token(oauth_user.id)}"}
    resp = client.put(f"{API}/me", json={"newPassword": NEW_PASSWORD}, headers=headers)
    assert resp.status_code == 200
    assert _login(client, "g@example.com", NEW_PASSWORD).status_code == 200


def test_update_me_requires_auth(client: TestClient) -> None:
    assert client.put(f"{API}/me", json={"fullName": "x"}).status_code == 401


# ----------------------------------------------------------------------------- Google OAuth


@pytest.fixture()
def google_configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google, "is_configured", lambda: True)
    monkeypatch.setattr(
        google, "exchange_code_for_tokens", lambda code: {"access_token": "google-at"}
    )


def _mock_userinfo(monkeypatch: pytest.MonkeyPatch, **info: Any) -> None:
    payload = {
        "sub": "google-sub-1",
        "email": "gina@example.com",
        "email_verified": True,
        "name": "Gina",
    }
    payload.update(info)
    monkeypatch.setattr(google, "fetch_userinfo", lambda token: payload)


def _start_google(client: TestClient) -> str:
    resp = client.get(f"{API}/google", follow_redirects=False)
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith(google.GOOGLE_AUTH_URL)
    assert google.STATE_COOKIE_NAME in resp.cookies
    set_cookie = resp.headers["set-cookie"].lower()
    assert "httponly" in set_cookie and "samesite=lax" in set_cookie
    return parse_qs(urlparse(location).query)["state"][0]


def _fragment(location: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlparse(location).fragment).items()}


def test_google_callback_creates_user(
    client: TestClient,
    db: Session,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_userinfo(monkeypatch)
    state = _start_google(client)
    resp = client.get(
        f"{API}/google/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert resp.status_code == 302
    location = resp.headers["location"]
    assert location.startswith(f"{settings.APP_BASE_URL}/oauth/callback#")
    tokens = _fragment(location)
    me = client.get(f"{API}/me", headers={"Authorization": f"Bearer {tokens['accessToken']}"})
    assert me.status_code == 200
    data = me.json()
    assert data["email"] == "gina@example.com"
    assert data["isVerified"] is True
    assert data["oauthProvider"] == "google"
    assert tokens["refreshToken"]


def test_google_callback_links_existing_user(
    client: TestClient,
    db: Session,
    user: User,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _mock_userinfo(monkeypatch, email=user.email.upper(), sub="sub-xyz")
    state = _start_google(client)
    resp = client.get(
        f"{API}/google/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert resp.headers["location"].startswith(f"{settings.APP_BASE_URL}/oauth/callback#")
    db.refresh(user)
    assert user.oauth_provider == "google"
    assert user.oauth_sub == "sub-xyz"
    assert db.scalar(select(User).where(User.email == user.email)) is user


def test_google_callback_bad_state_rejected(
    client: TestClient, google_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_userinfo(monkeypatch)
    failure = f"{settings.APP_BASE_URL}/login?error=oauth_failed"

    state = _start_google(client)
    # Tampered query state (does not match cookie).
    resp = client.get(
        f"{API}/google/callback",
        params={"code": "c", "state": state + "x"},
        follow_redirects=False,
    )
    assert resp.headers["location"] == failure

    # Validly signed state but no cookie (CSRF: attacker-initiated flow).
    client.cookies.clear()
    resp = client.get(
        f"{API}/google/callback",
        params={"code": "c", "state": google.create_state()},
        follow_redirects=False,
    )
    assert resp.headers["location"] == failure

    # Missing code / provider error.
    state = _start_google(client)
    resp = client.get(
        f"{API}/google/callback",
        params={"error": "access_denied", "state": state},
        follow_redirects=False,
    )
    assert resp.headers["location"] == failure


def test_google_callback_unverified_email_rejected(
    client: TestClient, db: Session, google_configured: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    _mock_userinfo(monkeypatch, email_verified=False)
    state = _start_google(client)
    resp = client.get(
        f"{API}/google/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert resp.headers["location"] == f"{settings.APP_BASE_URL}/login?error=oauth_failed"
    assert db.scalar(select(User).where(User.email == "gina@example.com")) is None


def test_google_callback_inactive_user_rejected(
    client: TestClient,
    db: Session,
    user: User,
    google_configured: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    user.is_active = False
    db.commit()
    _mock_userinfo(monkeypatch, email=user.email)
    state = _start_google(client)
    resp = client.get(
        f"{API}/google/callback", params={"code": "c", "state": state}, follow_redirects=False
    )
    assert resp.headers["location"] == f"{settings.APP_BASE_URL}/login?error=oauth_failed"


def test_google_start_not_configured(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google, "is_configured", lambda: False)
    resp = client.get(f"{API}/google", follow_redirects=False)
    assert resp.status_code == 302
    assert resp.headers["location"] == f"{settings.APP_BASE_URL}/login?error=oauth_failed"


def test_me_exposes_has_password_but_not_hash(client, auth_headers, db, user) -> None:
    body = client.get("/api/v1/auth/me", headers=auth_headers).json()
    assert body["hasPassword"] is True
    assert "hashedPassword" not in body and "hashed_password" not in body

    user.hashed_password = None
    db.commit()
    assert client.get("/api/v1/auth/me", headers=auth_headers).json()["hasPassword"] is False
