"""API tests for the bills module (``/api/v1/bills``) and the public bill view."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import BillStatus
from app.exceptions import NotFoundError
from app.models import User
from tests.helpers import make_bill, make_customer, make_profile

URL = "/api/v1/bills"
PUBLIC = "/api/v1/public/bills"


@pytest.fixture(autouse=True)
def _fake_pdf(monkeypatch: pytest.MonkeyPatch) -> None:
    """WeasyPrint needs Pango; tests only care that *a* PDF is stored."""
    monkeypatch.setattr("app.services.pdf_service._html_to_pdf", lambda html, base: b"%PDF-test")


def _payload(customer_id: int, **extra: Any) -> dict[str, Any]:
    return {
        "customerId": customer_id,
        "lineItems": [{"description": "Design", "quantity": "2", "unitPrice": "10.00"}],
        **extra,
    }


# --------------------------------------------------------------------------- create


def test_create_uses_profile_defaults_and_computes_totals(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    make_profile(db, user, default_due_days=10, default_tax_rate="10", default_currency="EUR")
    customer = make_customer(db, user)
    body = {
        "customerId": customer.id,
        "lineItems": [
            {"description": "A", "quantity": "2", "unitPrice": "10.00"},
            {"description": "B", "quantity": "1", "unitPrice": "5.55"},
        ],
    }
    resp = client.post(URL, json=body, headers=auth_headers)
    assert resp.status_code == 201, resp.text
    data = resp.json()
    assert data["status"] == "draft"
    assert data["currency"] == "EUR"
    assert data["subtotal"] == "25.55"
    assert data["taxAmount"] == "2.56"  # 2.555 rounds half up
    assert data["total"] == "28.11"
    delta = date.fromisoformat(data["dueDate"]) - date.fromisoformat(data["issueDate"])
    assert delta == timedelta(days=10)


def test_create_numbers_are_unique(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    make_profile(db, user)
    customer = make_customer(db, user)
    first = client.post(URL, json=_payload(customer.id), headers=auth_headers).json()
    second = client.post(URL, json=_payload(customer.id), headers=auth_headers).json()
    assert first["billNumber"] != second["billNumber"]


def test_create_requires_profile(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    customer = make_customer(db, user)
    resp = client.post(URL, json=_payload(customer.id), headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "profile_required"


def test_create_rejects_archived_and_foreign_customer(
    client: TestClient, db: Session, user: User, other_user: User, auth_headers: dict[str, str]
) -> None:
    make_profile(db, user)
    archived = make_customer(db, user, active=False)
    foreign = make_customer(db, other_user)
    resp = client.post(URL, json=_payload(archived.id), headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (409, "customer_archived")
    resp = client.post(URL, json=_payload(foreign.id), headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (404, "customer_not_found")


@pytest.mark.parametrize(
    "extra",
    [
        {"lineItems": []},
        {"lineItems": [{"description": "x", "quantity": "0", "unitPrice": "1.00"}]},
        {"lineItems": [{"description": "x", "quantity": "1", "unitPrice": "-1.00"}]},
        {"taxRate": "101"},
        {"issueDate": "2026-05-10", "dueDate": "2026-05-01"},
    ],
)
def test_create_validation(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    extra: dict[str, Any],
) -> None:
    make_profile(db, user)
    customer = make_customer(db, user)
    resp = client.post(URL, json={**_payload(customer.id), **extra}, headers=auth_headers)
    assert resp.status_code == 422


# --------------------------------------------------------------------------- read


def test_list_filters_and_tenancy(
    client: TestClient,
    db: Session,
    user: User,
    other_user: User,
    auth_headers: dict[str, str],
) -> None:
    c1, c2 = make_customer(db, user, "One"), make_customer(db, user, "Two")
    make_bill(db, user, c1, status=BillStatus.SENT)
    paid = make_bill(db, user, c2, status=BillStatus.PAID)
    make_bill(db, other_user, make_customer(db, other_user))

    assert client.get(URL, headers=auth_headers).json()["total"] == 2
    by_status = client.get(URL, params={"status": "paid"}, headers=auth_headers).json()
    assert [b["id"] for b in by_status["items"]] == [paid.id]
    by_customer = client.get(URL, params={"customerId": c1.id}, headers=auth_headers).json()
    assert by_customer["total"] == 1
    future = (date.today() + timedelta(days=1)).isoformat()
    assert client.get(URL, params={"from": future}, headers=auth_headers).json()["total"] == 0


def test_detail_and_other_tenant_404(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    detail = client.get(f"{URL}/{bill.id}", headers=auth_headers)
    assert detail.status_code == 200
    assert detail.json()["lineItems"][0]["description"] == "Service"
    assert client.get(f"{URL}/{bill.id}", headers=other_auth_headers).status_code == 404
    assert client.get(f"{URL}/999999", headers=auth_headers).status_code == 404


def test_requires_auth(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.post(URL, json={}).status_code == 401


# --------------------------------------------------------------------------- update


def test_update_draft_recomputes_totals(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), status=BillStatus.DRAFT)
    resp = client.put(
        f"{URL}/{bill.id}",
        json={
            "taxRate": "20",
            "lineItems": [{"description": "N", "quantity": "1", "unitPrice": "50"}],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert (data["subtotal"], data["taxAmount"], data["total"]) == ("50.00", "10.00", "60.00")


def test_update_non_draft_conflicts(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), status=BillStatus.SENT)
    resp = client.put(f"{URL}/{bill.id}", json={"taxRate": "5"}, headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (409, "bill_not_draft")


def test_update_rejects_null_fields(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), status=BillStatus.DRAFT)
    resp = client.put(f"{URL}/{bill.id}", json={"dueDate": None}, headers=auth_headers)
    assert resp.status_code == 422


# --------------------------------------------------------------------------- send / remind


def test_send_marks_sent_and_emails_customer(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    sent_emails: list[dict[str, Any]],
) -> None:
    make_profile(db, user)
    bill = make_bill(db, user, make_customer(db, user), status=BillStatus.DRAFT)
    resp = client.post(f"{URL}/{bill.id}/send", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    assert resp.json()["status"] == "sent"
    assert resp.json()["hasPdf"] is True
    assert len(sent_emails) == 1
    assert sent_emails[0]["to"] == [bill.customer.email]
    assert sent_emails[0]["attachments"][0]["filename"] == f"{bill.bill_number}.pdf"
    detail = client.get(f"{URL}/{bill.id}", headers=auth_headers).json()
    assert detail["emailLogs"][0]["status"] == "sent"


def test_send_email_failure_keeps_draft_and_logs(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _boom(payload: dict[str, Any]) -> str:
        raise RuntimeError("resend down")

    monkeypatch.setattr("app.services.email_service._deliver", _boom)
    make_profile(db, user)
    bill = make_bill(db, user, make_customer(db, user), status=BillStatus.DRAFT)
    resp = client.post(f"{URL}/{bill.id}/send", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["status"] == "draft"
    detail = client.get(f"{URL}/{bill.id}", headers=auth_headers).json()
    assert detail["emailLogs"][0]["status"] == "failed"


@pytest.mark.parametrize("status", [BillStatus.PAID, BillStatus.CANCELLED, BillStatus.OVERDUE])
def test_send_rejects_unsendable_status(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str], status: BillStatus
) -> None:
    make_profile(db, user)
    bill = make_bill(db, user, make_customer(db, user), status=status)
    resp = client.post(f"{URL}/{bill.id}/send", headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (409, "bill_not_sendable")


def test_remind_overdue_and_rejects_draft(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    sent_emails: list[dict[str, Any]],
) -> None:
    make_profile(db, user)
    customer = make_customer(db, user)
    overdue = make_bill(
        db, user, customer, status=BillStatus.OVERDUE, due=date.today() - timedelta(days=3)
    )
    draft = make_bill(db, user, customer, status=BillStatus.DRAFT)
    assert client.post(f"{URL}/{overdue.id}/remind", headers=auth_headers).status_code == 200
    assert len(sent_emails) == 1
    resp = client.post(f"{URL}/{draft.id}/remind", headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (409, "bill_not_remindable")


# --------------------------------------------------------------------------- cancel


def test_cancel(client: TestClient, db: Session, user: User, auth_headers: dict[str, str]) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    resp = client.post(f"{URL}/{bill.id}/cancel", headers=auth_headers)
    assert resp.status_code == 200 and resp.json()["status"] == "cancelled"
    again = client.post(f"{URL}/{bill.id}/cancel", headers=auth_headers)
    assert (again.status_code, again.json()["code"]) == (409, "bill_cancelled")


def test_cancel_with_payment_conflicts(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    pay = client.post(
        f"{URL}/{bill.id}/payments",
        json={"amount": "10.00", "method": "cash"},
        headers=auth_headers,
    )
    assert pay.status_code == 201
    resp = client.post(f"{URL}/{bill.id}/cancel", headers=auth_headers)
    assert (resp.status_code, resp.json()["code"]) == (409, "bill_has_payments")


# --------------------------------------------------------------------------- pdf


def test_pdf_rendered_on_demand(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    make_profile(db, user)
    bill = make_bill(db, user, make_customer(db, user))
    resp = client.get(f"{URL}/{bill.id}/pdf", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert resp.content == b"%PDF-test"
    db.refresh(bill)
    assert bill.pdf_file_id is not None
    # Second call reads the stored blob instead of re-rendering.
    assert client.get(f"{URL}/{bill.id}/pdf", headers=auth_headers).content == b"%PDF-test"


def test_pdf_is_rebuilt_when_the_stored_file_is_missing(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    make_profile(db, user)
    bill = make_bill(db, user, make_customer(db, user))
    assert client.get(f"{URL}/{bill.id}/pdf", headers=auth_headers).status_code == 200
    db.refresh(bill)
    first_file_id = bill.pdf_file_id

    def _gone(record: object) -> bytes:
        raise NotFoundError("File not found", code="file_not_found")

    monkeypatch.setattr("app.services.upload_service.read_upload_bytes", _gone)
    resp = client.get(f"{URL}/{bill.id}/pdf", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.content == b"%PDF-test"
    db.refresh(bill)
    assert bill.pdf_file_id is not None and bill.pdf_file_id != first_file_id


# --------------------------------------------------------------------------- public


def test_public_bill_view(client: TestClient, db: Session, user: User) -> None:
    make_profile(db, user, address="1 Main St")
    bill = make_bill(db, user, make_customer(db, user, "Zed"))
    resp = client.get(f"{PUBLIC}/{bill.public_token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["billNumber"] == bill.bill_number
    assert body["business"]["name"] == "Acme Ltd"
    assert body["customer"]["name"] == "Zed"
    assert bill.customer.email not in resp.text
    assert "userId" not in resp.text


def test_public_bill_hides_drafts_and_unknown_tokens(
    client: TestClient, db: Session, user: User
) -> None:
    make_profile(db, user)
    draft = make_bill(db, user, make_customer(db, user), status=BillStatus.DRAFT)
    assert client.get(f"{PUBLIC}/{draft.public_token}").status_code == 404
    assert client.get(f"{PUBLIC}/not-a-token").status_code == 404


def test_public_pay_link_only_while_payable(client: TestClient, db: Session, user: User) -> None:
    make_profile(db, user)
    customer = make_customer(db, user)
    paid = make_bill(db, user, customer, status=BillStatus.PAID)
    paid.payment_link_url = "https://pay.example/x"
    sent = make_bill(db, user, customer)
    sent.payment_link_url = "https://pay.example/y"
    db.flush()
    assert client.get(f"{PUBLIC}/{paid.public_token}").json()["paymentLinkUrl"] is None
    assert client.get(f"{PUBLIC}/{sent.public_token}").json()["paymentLinkUrl"] == (
        "https://pay.example/y"
    )
