"""API tests for ``/api/v1/uploads`` (DB-backed)."""

from __future__ import annotations

from collections.abc import Iterator
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.enums import FilePurpose
from app.models import BusinessProfile, UploadedFile, User
from app.services import storage_service, upload_service
from app.services.storage_service import LocalStorage

URL = "/api/v1/uploads"
PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF"
SAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1"/></svg>'
UNSAFE_SVG = b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'


@pytest.fixture(autouse=True)
def storage(tmp_path: Path) -> Iterator[LocalStorage]:
    backend = LocalStorage(tmp_path / "uploads")
    storage_service.set_storage(backend)
    yield backend
    storage_service.set_storage(None)


def _upload(
    client: TestClient,
    headers: dict[str, str],
    data: bytes,
    *,
    purpose: str = "logo",
    filename: str = "logo.png",
    content_type: str = "image/png",
) -> httpx.Response:
    return client.post(
        URL,
        headers=headers,
        files={"file": (filename, data, content_type)},
        data={"purpose": purpose},
    )


def test_requires_auth(client: TestClient) -> None:
    resp = client.post(
        URL, files={"file": ("a.png", PNG_BYTES, "image/png")}, data={"purpose": "logo"}
    )
    assert resp.status_code == 401


def test_upload_png_logo(
    client: TestClient, auth_headers: dict[str, str], storage: LocalStorage, db: Session
) -> None:
    resp = _upload(client, auth_headers, PNG_BYTES, filename="../My Logo.png")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["filename"] == "My Logo.png"
    assert body["contentType"] == "image/png"
    assert body["sizeBytes"] == len(PNG_BYTES)
    assert body["purpose"] == "logo"
    assert body["url"] == f"{URL}/{body['id']}"
    assert "createdAt" in body
    record = db.get(UploadedFile, body["id"])
    assert record is not None
    assert storage.open(record.storage_key) == PNG_BYTES


def test_upload_pdf_attachment(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(
        client,
        auth_headers,
        PDF_BYTES,
        purpose="attachment",
        filename="terms.pdf",
        content_type="application/pdf",
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["contentType"] == "application/pdf"


def test_spoofed_content_type_rejected(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(
        client, auth_headers, b"<html><script>x</script></html>", content_type="image/png"
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "unsupported_file_type"


def test_pdf_not_allowed_as_logo(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(client, auth_headers, PDF_BYTES, filename="x.png", content_type="image/png")
    assert resp.status_code == 400
    assert resp.json()["code"] == "unsupported_file_type"


def test_oversize_logo_rejected(
    client: TestClient, auth_headers: dict[str, str], db: Session
) -> None:
    big = PNG_BYTES + b"\x00" * upload_service.LOGO_MAX_BYTES
    resp = _upload(client, auth_headers, big)
    assert resp.status_code == 400
    assert resp.json()["code"] == "file_too_large"
    assert db.scalar(select(UploadedFile)) is None


def test_oversize_attachment_rejected(
    client: TestClient, auth_headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(upload_service.settings, "MAX_UPLOAD_MB", 1)
    big = PDF_BYTES + b"\x00" * (1024 * 1024)
    resp = _upload(client, auth_headers, big, purpose="attachment", content_type="application/pdf")
    assert resp.status_code == 400
    assert resp.json()["code"] == "file_too_large"


def test_bill_pdf_purpose_not_allowed(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(client, auth_headers, PDF_BYTES, purpose="bill_pdf")
    assert resp.status_code == 400
    assert resp.json()["code"] == "invalid_purpose"


def test_invalid_purpose_is_422(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(client, auth_headers, PNG_BYTES, purpose="avatar")
    assert resp.status_code == 422


def test_unsafe_svg_rejected(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = _upload(
        client, auth_headers, UNSAFE_SVG, filename="logo.svg", content_type="image/svg+xml"
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "unsafe_svg"


def test_safe_svg_upload_and_download_headers(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    resp = _upload(
        client, auth_headers, SAFE_SVG, filename="logo.svg", content_type="image/svg+xml"
    )
    assert resp.status_code == 201, resp.text
    assert resp.json()["contentType"] == "image/svg+xml"

    dl = client.get(resp.json()["url"], headers=auth_headers)
    assert dl.status_code == 200
    assert dl.content == SAFE_SVG
    assert dl.headers["content-type"].startswith("image/svg+xml")
    assert dl.headers["x-content-type-options"] == "nosniff"
    assert "default-src 'none'" in dl.headers["content-security-policy"]
    assert "sandbox" in dl.headers["content-security-policy"]


def test_download_returns_bytes(client: TestClient, auth_headers: dict[str, str]) -> None:
    upload_id = _upload(client, auth_headers, PNG_BYTES).json()["id"]
    resp = client.get(f"{URL}/{upload_id}", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.content == PNG_BYTES
    assert resp.headers["content-type"] == "image/png"
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["content-disposition"].startswith('inline; filename="logo.png"')
    assert "content-security-policy" not in resp.headers


def test_cross_tenant_get_and_delete_are_404(
    client: TestClient,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
    storage: LocalStorage,
    db: Session,
) -> None:
    upload_id = _upload(client, auth_headers, PNG_BYTES).json()["id"]
    assert client.get(f"{URL}/{upload_id}", headers=other_auth_headers).status_code == 404
    resp = client.delete(f"{URL}/{upload_id}", headers=other_auth_headers)
    assert resp.status_code == 404
    record = db.get(UploadedFile, upload_id)
    assert record is not None
    assert storage.exists(record.storage_key)


def test_missing_upload_404(client: TestClient, auth_headers: dict[str, str]) -> None:
    assert client.get(f"{URL}/999999", headers=auth_headers).status_code == 404
    assert client.delete(f"{URL}/999999", headers=auth_headers).status_code == 404


def test_delete_removes_blob_and_clears_logo(
    client: TestClient,
    auth_headers: dict[str, str],
    user: User,
    storage: LocalStorage,
    db: Session,
) -> None:
    upload_id = _upload(client, auth_headers, PNG_BYTES).json()["id"]
    key = db.get(UploadedFile, upload_id).storage_key  # type: ignore[union-attr]
    put = client.put(
        "/api/v1/business-profile",
        headers=auth_headers,
        json={"businessName": "Acme", "logoFileId": upload_id},
    )
    assert put.status_code == 200, put.text
    assert put.json()["logoUrl"] == f"{URL}/{upload_id}"

    resp = client.delete(f"{URL}/{upload_id}", headers=auth_headers)
    assert resp.status_code == 204
    assert not storage.exists(key)
    assert client.get(f"{URL}/{upload_id}", headers=auth_headers).status_code == 404

    db.expire_all()
    profile = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user.id))
    assert profile is not None
    assert profile.logo_file_id is None
    got = client.get("/api/v1/business-profile", headers=auth_headers).json()
    assert got["logoFileId"] is None
    assert got["logoUrl"] is None


def test_service_create_upload_bill_pdf(db: Session, user: User, storage: LocalStorage) -> None:
    record = upload_service.create_upload(db, user, PDF_BYTES, "BM-00001.pdf", FilePurpose.BILL_PDF)
    assert record.purpose is FilePurpose.BILL_PDF
    assert record.storage_key.startswith(f"{user.id}/bill_pdf/")
    assert upload_service.read_upload_bytes(upload_service.get_upload(db, user, record.id)) == (
        PDF_BYTES
    )
