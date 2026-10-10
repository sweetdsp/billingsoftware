"""API tests for ``/api/v1/business-profile`` (DB-backed)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import FilePurpose
from app.models import BusinessProfile, User
from app.services import storage_service, upload_service
from app.services.storage_service import LocalStorage

URL = "/api/v1/business-profile"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF_BYTES = b"%PDF-1.4\n%%EOF"


@pytest.fixture(autouse=True)
def storage(tmp_path: Path) -> Iterator[LocalStorage]:
    backend = LocalStorage(tmp_path / "uploads")
    storage_service.set_storage(backend)
    yield backend
    storage_service.set_storage(None)


def _payload(**overrides: Any) -> dict[str, Any]:
    body: dict[str, Any] = {
        "businessName": "Acme Studio",
        "address": "1 Main St\nSpringfield",
        "phone": "+1 555 0100",
        "email": "billing@acme.example",
        "taxId": "GST-123",
        "defaultCurrency": "INR",
        "billNumberPrefix": "ACME/",
        "defaultDueDays": 15,
        "defaultTaxRate": "18",
        "reminderDaysAfterDue": [14, 3, 7],
        "footerNote": "Thank you!",
    }
    body.update(overrides)
    return body


def test_requires_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.put(URL, json=_payload()).status_code == 401


def test_404_before_onboarding(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "profile_not_found"


def test_upsert_creates_then_updates(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.put(URL, headers=auth_headers, json=_payload())
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["businessName"] == "Acme Studio"
    assert body["defaultCurrency"] == "INR"
    assert body["billNumberPrefix"] == "ACME/"
    assert body["defaultTaxRate"] == "18.00"
    assert body["reminderDaysAfterDue"] == [3, 7, 14]
    assert body["nextBillNumber"] == 1
    assert body["logoUrl"] is None
    assert body["createdAt"] and body["updatedAt"]
    profile_id = body["id"]

    got = client.get(URL, headers=auth_headers)
    assert got.status_code == 200
    assert got.json() == body

    resp = client.put(
        URL,
        headers=auth_headers,
        json=_payload(businessName="Acme 2", defaultTaxRate="5.5", email="", phone=None),
    )
    assert resp.status_code == 200, resp.text
    updated = resp.json()
    assert updated["id"] == profile_id
    assert updated["businessName"] == "Acme 2"
    assert updated["defaultTaxRate"] == "5.50"
    assert updated["email"] is None
    assert updated["phone"] is None


def test_minimal_payload_uses_defaults(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.put(URL, headers=auth_headers, json={"businessName": "Solo"})
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["defaultCurrency"] == "USD"
    assert body["billNumberPrefix"] == "BM-"
    assert body["defaultDueDays"] == 7
    assert body["defaultTaxRate"] == "0.00"
    assert body["reminderDaysAfterDue"] == [1, 7, 14]


def test_next_bill_number_not_client_writable(
    client: TestClient, auth_headers: dict[str, str], user: User, db: Session
) -> None:
    client.put(URL, headers=auth_headers, json=_payload())
    profile = db.query(BusinessProfile).filter_by(user_id=user.id).one()
    profile.next_bill_number = 42
    db.commit()
    resp = client.put(URL, headers=auth_headers, json=_payload(nextBillNumber=1))
    assert resp.status_code == 200
    assert resp.json()["nextBillNumber"] == 42


@pytest.mark.parametrize(
    "overrides",
    [
        {"businessName": ""},
        {"businessName": "x" * 201},
        {"defaultCurrency": "usd"},
        {"defaultCurrency": "US"},
        {"defaultCurrency": "USDX"},
        {"billNumberPrefix": "BM #"},
        {"billNumberPrefix": "A" * 21},
        {"defaultDueDays": -1},
        {"defaultDueDays": 366},
        {"defaultTaxRate": "100.01"},
        {"defaultTaxRate": "-1"},
        {"reminderDaysAfterDue": [0]},
        {"reminderDaysAfterDue": [366]},
        {"reminderDaysAfterDue": [1, 1]},
        {"reminderDaysAfterDue": list(range(1, 12))},
        {"email": "not-an-email"},
        {"footerNote": "x" * 1001},
    ],
)
def test_validation_errors(
    client: TestClient, auth_headers: dict[str, str], overrides: dict[str, Any]
) -> None:
    resp = client.put(URL, headers=auth_headers, json=_payload(**overrides))
    assert resp.status_code == 422, overrides


def test_logo_must_be_own_logo_upload(
    client: TestClient,
    auth_headers: dict[str, str],
    user: User,
    other_user: User,
    db: Session,
) -> None:
    own_logo = upload_service.create_upload(db, user, PNG_BYTES, "logo.png", FilePurpose.LOGO)
    own_attachment = upload_service.create_upload(
        db, user, PDF_BYTES, "a.pdf", FilePurpose.ATTACHMENT
    )
    foreign_logo = upload_service.create_upload(
        db, other_user, PNG_BYTES, "logo.png", FilePurpose.LOGO
    )

    for bad_id in (foreign_logo.id, own_attachment.id, 999999):
        resp = client.put(URL, headers=auth_headers, json=_payload(logoFileId=bad_id))
        assert resp.status_code == 400, bad_id
        assert resp.json()["code"] == "invalid_logo"

    resp = client.put(URL, headers=auth_headers, json=_payload(logoFileId=own_logo.id))
    assert resp.status_code == 200, resp.text
    assert resp.json()["logoFileId"] == own_logo.id
    assert resp.json()["logoUrl"] == f"/api/v1/uploads/{own_logo.id}"

    resp = client.put(URL, headers=auth_headers, json=_payload(logoFileId=None))
    assert resp.json()["logoUrl"] is None


def test_profiles_are_per_user(
    client: TestClient, auth_headers: dict[str, str], other_auth_headers: dict[str, str]
) -> None:
    client.put(URL, headers=auth_headers, json=_payload())
    assert client.get(URL, headers=other_auth_headers).status_code == 404
    resp = client.put(URL, headers=other_auth_headers, json=_payload(businessName="Other"))
    assert resp.status_code == 200
    assert client.get(URL, headers=auth_headers).json()["businessName"] == "Acme Studio"
