"""API tests for payments: manual payments, listing and deletion."""

from __future__ import annotations

from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import BillStatus
from app.models import User
from tests.helpers import make_bill, make_customer

BILLS = "/api/v1/bills"
PAYMENTS = "/api/v1/payments"


def _pay(
    client: TestClient, headers: dict[str, str], bill_id: int, amount: str, method: str = "cash"
) -> Any:
    return client.post(
        f"{BILLS}/{bill_id}/payments", json={"amount": amount, "method": method}, headers=headers
    )


def test_partial_then_full_payment_updates_status(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), total="100.00")
    first = _pay(client, auth_headers, bill.id, "40.00")
    assert first.status_code == 201, first.text
    assert first.json()["provider"] == "manual"
    detail = client.get(f"{BILLS}/{bill.id}", headers=auth_headers).json()
    assert (detail["status"], detail["amountPaid"], detail["balanceDue"]) == (
        "partially_paid",
        "40.00",
        "60.00",
    )
    assert _pay(client, auth_headers, bill.id, "60.00", "bank_transfer").status_code == 201
    detail = client.get(f"{BILLS}/{bill.id}", headers=auth_headers).json()
    assert detail["status"] == "paid" and detail["paidAt"] is not None


def test_overpayment_rejected(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), total="50.00")
    resp = _pay(client, auth_headers, bill.id, "50.01")
    assert (resp.status_code, resp.json()["code"]) == (400, "overpayment")


def test_online_method_rejected(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    resp = _pay(client, auth_headers, bill.id, "10.00", "online")
    assert (resp.status_code, resp.json()["code"]) == (400, "invalid_method")


@pytest.mark.parametrize("status", [BillStatus.DRAFT, BillStatus.CANCELLED])
def test_unpayable_status_conflicts(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str], status: BillStatus
) -> None:
    bill = make_bill(db, user, make_customer(db, user), status=status)
    resp = _pay(client, auth_headers, bill.id, "10.00")
    assert (resp.status_code, resp.json()["code"]) == (409, "bill_not_payable")


@pytest.mark.parametrize("amount", ["0", "-5.00", "abc"])
def test_invalid_amount_422(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str], amount: str
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    assert _pay(client, auth_headers, bill.id, amount).status_code == 422


def test_future_paid_at_422(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    resp = client.post(
        f"{BILLS}/{bill.id}/payments",
        json={"amount": "1.00", "method": "cash", "paidAt": "2999-01-01T00:00:00Z"},
        headers=auth_headers,
    )
    assert resp.status_code == 422


def test_other_tenant_cannot_pay_bill(
    client: TestClient, db: Session, user: User, other_auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    assert _pay(client, other_auth_headers, bill.id, "10.00").status_code == 404


def test_list_filters_and_tenancy(
    client: TestClient,
    db: Session,
    user: User,
    other_user: User,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    c1, c2 = make_customer(db, user, "One"), make_customer(db, user, "Two")
    b1, b2 = make_bill(db, user, c1), make_bill(db, user, c2)
    _pay(client, auth_headers, b1.id, "10.00", "cash")
    _pay(client, auth_headers, b2.id, "20.00", "cheque")
    foreign = make_bill(db, other_user, make_customer(db, other_user))
    _pay(client, other_auth_headers, foreign.id, "5.00")

    page = client.get(PAYMENTS, headers=auth_headers).json()
    assert page["total"] == 2
    assert {p["billNumber"] for p in page["items"]} == {b1.bill_number, b2.bill_number}
    by_method = client.get(PAYMENTS, params={"method": "cheque"}, headers=auth_headers).json()
    assert by_method["total"] == 1
    by_customer = client.get(PAYMENTS, params={"customerId": c1.id}, headers=auth_headers).json()
    assert [p["amount"] for p in by_customer["items"]] == ["10.00"]
    future = client.get(PAYMENTS, params={"from": "2999-01-01"}, headers=auth_headers).json()
    assert future["total"] == 0


def test_delete_manual_payment_recalculates_bill(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    bill = make_bill(db, user, make_customer(db, user), total="100.00")
    payment_id = _pay(client, auth_headers, bill.id, "100.00").json()["id"]
    assert client.get(f"{BILLS}/{bill.id}", headers=auth_headers).json()["status"] == "paid"
    assert client.delete(f"{PAYMENTS}/{payment_id}", headers=auth_headers).status_code == 204
    detail = client.get(f"{BILLS}/{bill.id}", headers=auth_headers).json()
    assert (detail["status"], detail["amountPaid"]) == ("sent", "0.00")
    assert client.delete(f"{PAYMENTS}/{payment_id}", headers=auth_headers).status_code == 404


def test_delete_other_tenant_payment_404(
    client: TestClient,
    db: Session,
    user: User,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    bill = make_bill(db, user, make_customer(db, user))
    payment_id = _pay(client, auth_headers, bill.id, "10.00").json()["id"]
    assert client.delete(f"{PAYMENTS}/{payment_id}", headers=other_auth_headers).status_code == 404


def test_payments_require_auth(client: TestClient) -> None:
    assert client.get(PAYMENTS).status_code == 401
    assert client.delete(f"{PAYMENTS}/1").status_code == 401
