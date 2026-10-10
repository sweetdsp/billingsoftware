"""Shared pytest fixtures for Bill Maker.

Tests run against a real PostgreSQL database (the models use JSONB/ARRAY), taken from
``TEST_DATABASE_URL`` (falls back to ``DATABASE_URL``). Each test runs inside a
transaction that is rolled back afterwards, so tests never see each other's data.

Fixture contract used by every module's tests:
- ``db``            Session bound to the per-test transaction.
- ``client``        TestClient whose ``get_db`` dependency yields ``db``.
- ``user`` / ``other_user``  two verified, active users (for tenancy tests).
- ``auth_headers`` / ``other_auth_headers``  Bearer headers for those users.
- ``sent_emails``   list capturing every email "sent" via ``email_service.send_email``.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from typing import Any

os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("SCHEDULER_ENABLED", "false")
_TEST_DB_URL = os.environ.get(
    "TEST_DATABASE_URL",
    os.environ.get(
        "DATABASE_URL", "postgresql+pg8000://postgres:postgres@localhost:5432/bill_maker_test"
    ),
)
os.environ["DATABASE_URL"] = _TEST_DB_URL

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.engine import Connection, Engine  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import app.models  # noqa: E402, F401  (register all tables on Base.metadata)
from app.config import settings  # noqa: E402
from app.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.models import User  # noqa: E402

TEST_PASSWORD = "Sup3r-secret-pass"  # noqa: S105


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    """Create all tables once per test session and drop them at the end."""
    eng = create_engine(settings.DATABASE_URL, pool_pre_ping=True)
    Base.metadata.drop_all(eng)
    Base.metadata.create_all(eng)
    yield eng
    Base.metadata.drop_all(eng)
    eng.dispose()


@pytest.fixture()
def connection(engine: Engine) -> Iterator[Connection]:
    """One connection + outer transaction per test, always rolled back."""
    conn = engine.connect()
    trans = conn.begin()
    yield conn
    trans.rollback()
    conn.close()


@pytest.fixture()
def db(connection: Connection) -> Iterator[Session]:
    """Session whose commits become SAVEPOINT releases inside the outer transaction."""
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()


@pytest.fixture()
def client(db: Session) -> Iterator[TestClient]:
    """API client using the per-test session for every request."""

    def _override_get_db() -> Iterator[Session]:
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.pop(get_db, None)


def _make_user(db: Session, email: str, *, is_admin: bool = False) -> User:
    from app.auth.security import hash_password

    u = User(
        email=email,
        hashed_password=hash_password(TEST_PASSWORD),
        full_name=email.split("@")[0].title(),
        is_active=True,
        is_verified=True,
        is_admin=is_admin,
    )
    db.add(u)
    db.commit()
    db.refresh(u)
    return u


@pytest.fixture()
def user(db: Session) -> User:
    return _make_user(db, "owner@example.com")


@pytest.fixture()
def other_user(db: Session) -> User:
    return _make_user(db, "intruder@example.com")


@pytest.fixture()
def admin_user(db: Session) -> User:
    return _make_user(db, "admin@example.com", is_admin=True)


def _headers(u: User) -> dict[str, str]:
    from app.auth.jwt import create_access_token

    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


@pytest.fixture()
def auth_headers(user: User) -> dict[str, str]:
    return _headers(user)


@pytest.fixture()
def other_auth_headers(other_user: User) -> dict[str, str]:
    return _headers(other_user)


@pytest.fixture()
def admin_headers(admin_user: User) -> dict[str, str]:
    return _headers(admin_user)


@pytest.fixture(autouse=True)
def sent_emails(monkeypatch: pytest.MonkeyPatch) -> list[dict[str, Any]]:
    """Never call Resend in tests: capture the payload that would have been sent."""
    captured: list[dict[str, Any]] = []

    def _fake_deliver(payload: dict[str, Any]) -> str:
        captured.append(payload)
        return f"test-msg-{len(captured)}"

    monkeypatch.setattr("app.services.email_service._deliver", _fake_deliver, raising=False)
    return captured
