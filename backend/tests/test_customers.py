"""API tests for the customers module (``/api/v1/customers``), DB-backed via conftest."""

from __future__ import annotations

from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from itertools import count
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.enums import (
    BillingFrequency,
    BillStatus,
    PaymentMethod,
    PaymentProvider,
    PaymentStatus,
    PlanStatus,
)
from app.models import Bill, BillingPlan, Customer, Payment, PlanLineItem, User

URL = "/api/v1/customers"
_seq = count(1)


# --------------------------------------------------------------------------- helpers


def _create(
    client: TestClient, headers: dict[str, str], name: str = "Acme", **extra: Any
) -> dict[str, Any]:
    payload: dict[str, Any] = {"name": name, "email": f"{name.lower()}@example.com", **extra}
    resp = client.post(URL, json=payload, headers=headers)
    assert resp.status_code == 201, resp.text
    body: dict[str, Any] = resp.json()
    return body


def _add_plan(
    db: Session,
    user: User,
    customer_id: int,
    *,
    status: PlanStatus = PlanStatus.ACTIVE,
    unit_price: str = "100.00",
    quantity: str = "1",
    tax_rate: str = "0",
) -> BillingPlan:
    plan = BillingPlan(
        user_id=user.id,
        customer_id=customer_id,
        name=f"Plan {next(_seq)}",
        currency="USD",
        frequency=BillingFrequency.MONTHLY,
        interval_count=1,
        start_date=date(2026, 1, 1),
        next_billing_date=date(2026, 2, 1),
        due_days=7,
        tax_rate=Decimal(tax_rate),
        auto_send=False,
        status=status,
    )
    plan.line_items.append(
        PlanLineItem(
            description="Service",
            quantity=Decimal(quantity),
            unit_price=Decimal(unit_price),
            position=0,
        )
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


def _add_bill(
    db: Session,
    user: User,
    customer_id: int,
    *,
    status: BillStatus,
    total: str,
    amount_paid: str = "0.00",
    issue_date: date = date(2026, 1, 1),
) -> Bill:
    total_dec = Decimal(total)
    bill = Bill(
        user_id=user.id,
        customer_id=customer_id,
        bill_number=f"INV-{next(_seq):05d}",
        issue_date=issue_date,
        due_date=issue_date + timedelta(days=7),
        currency="USD",
        subtotal=total_dec,
        tax_rate=Decimal("0"),
        tax_amount=Decimal("0"),
        total=total_dec,
        amount_paid=Decimal(amount_paid),
        status=status,
    )
    db.add(bill)
    db.commit()
    db.refresh(bill)
    return bill


def _add_payment(db: Session, user: User, bill: Bill, amount: str, paid_at: datetime) -> Payment:
    payment = Payment(
        user_id=user.id,
        bill_id=bill.id,
        amount=Decimal(amount),
        currency=bill.currency,
        method=PaymentMethod.CASH,
        provider=PaymentProvider.MANUAL,
        status=PaymentStatus.SUCCEEDED,
        paid_at=paid_at,
    )
    db.add(payment)
    db.commit()
    db.refresh(payment)
    return payment


# --------------------------------------------------------------------------- create


def test_create_customer_returns_201_and_camel_case(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    resp = client.post(
        URL,
        json={
            "name": " Acme Ltd ",
            "email": "Billing@ACME.com",
            "companyName": "Acme Ltd",
            "billingAddress": "1 Main St",
            "taxId": "GB123",
            "phone": "+44 1",
            "notes": "VIP",
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Acme Ltd"
    assert body["email"] == "billing@acme.com"
    assert body["companyName"] == "Acme Ltd"
    assert body["billingAddress"] == "1 Main St"
    assert body["taxId"] == "GB123"
    assert body["isActive"] is True
    assert {"id", "createdAt", "updatedAt"} <= body.keys()


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "Acme"},
        {"name": "Acme", "email": "not-an-email"},
        {"name": "", "email": "a@example.com"},
        {"email": "a@example.com"},
    ],
)
def test_create_validation_422(
    client: TestClient, auth_headers: dict[str, str], payload: dict[str, Any]
) -> None:
    resp = client.post(URL, json=payload, headers=auth_headers)
    assert resp.status_code == 422


def test_duplicate_email_409_then_allowed_after_archive(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    first = _create(client, auth_headers, "Acme")
    resp = client.post(
        URL, json={"name": "Other", "email": "ACME@example.com"}, headers=auth_headers
    )
    assert resp.status_code == 409
    assert resp.json()["code"] == "customer_email_exists"

    assert client.delete(f"{URL}/{first['id']}", headers=auth_headers).status_code == 204
    resp = client.post(
        URL, json={"name": "Other", "email": "acme@example.com"}, headers=auth_headers
    )
    assert resp.status_code == 201


def test_same_email_allowed_for_different_tenants(
    client: TestClient, auth_headers: dict[str, str], other_auth_headers: dict[str, str]
) -> None:
    _create(client, auth_headers, "Acme")
    _create(client, other_auth_headers, "Acme")


# --------------------------------------------------------------------------- list / search


def test_list_ordered_by_name_case_insensitive(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    for name in ("charlie", "Bravo", "alpha"):
        _create(client, auth_headers, name)
    resp = client.get(URL, headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert [c["name"] for c in body["items"]] == ["alpha", "Bravo", "charlie"]
    assert body["total"] == 3
    assert body["page"] == 1
    assert body["pageSize"] == 20
    assert body["items"][0]["balanceDue"] == "0.00"
    assert body["items"][0]["activePlanCount"] == 0


def test_list_is_tenant_scoped(
    client: TestClient, auth_headers: dict[str, str], other_auth_headers: dict[str, str]
) -> None:
    _create(client, auth_headers, "Mine")
    _create(client, other_auth_headers, "Theirs")
    body = client.get(URL, headers=auth_headers).json()
    assert [c["name"] for c in body["items"]] == ["Mine"]
    assert body["total"] == 1


def test_search_matches_name_email_and_company(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    _create(client, auth_headers, "Acme")
    _create(client, auth_headers, "Globex", companyName="Initech Holdings")
    _create(client, auth_headers, "Umbrella")

    def names(q: str) -> list[str]:
        resp = client.get(URL, params={"q": q}, headers=auth_headers)
        assert resp.status_code == 200
        return [c["name"] for c in resp.json()["items"]]

    assert names("ACM") == ["Acme"]
    assert names("initech") == ["Globex"]
    assert names("umbrella@example") == ["Umbrella"]
    assert names("nomatch") == []


def test_search_escapes_like_wildcards(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, "Fifty", companyName="50% Off Store")
    _create(client, auth_headers, "Plain", companyName="500 Store")
    _create(client, auth_headers, "Under", companyName="a_b corp")
    _create(client, auth_headers, "Nounder", companyName="axb corp")

    def names(q: str) -> list[str]:
        resp = client.get(URL, params={"q": q}, headers=auth_headers)
        return [c["name"] for c in resp.json()["items"]]

    assert names("50%") == ["Fifty"]
    assert names("a_b") == ["Under"]
    assert names("%") == ["Fifty"]
    assert names("_") == ["Under"]


def test_pagination_totals(client: TestClient, auth_headers: dict[str, str]) -> None:
    for i in range(5):
        _create(client, auth_headers, f"Cust{i}")
    resp = client.get(URL, params={"page": 2, "pageSize": 2}, headers=auth_headers)
    body = resp.json()
    assert body["total"] == 5
    assert body["page"] == 2
    assert body["pageSize"] == 2
    assert [c["name"] for c in body["items"]] == ["Cust2", "Cust3"]

    last = client.get(URL, params={"page": 3, "pageSize": 2}, headers=auth_headers).json()
    assert [c["name"] for c in last["items"]] == ["Cust4"]
    beyond = client.get(URL, params={"page": 9, "pageSize": 2}, headers=auth_headers).json()
    assert beyond["items"] == [] and beyond["total"] == 5


@pytest.mark.parametrize("params", [{"page": 0}, {"pageSize": 0}, {"pageSize": 101}])
def test_pagination_validation_422(
    client: TestClient, auth_headers: dict[str, str], params: dict[str, int]
) -> None:
    assert client.get(URL, params=params, headers=auth_headers).status_code == 422


def test_list_balance_due_and_active_plan_count(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    a = _create(client, auth_headers, "Alpha")
    b = _create(client, auth_headers, "Beta")
    _add_bill(db, user, a["id"], status=BillStatus.SENT, total="100.00")
    _add_bill(db, user, a["id"], status=BillStatus.PARTIALLY_PAID, total="50.00", amount_paid="20")
    _add_bill(db, user, a["id"], status=BillStatus.OVERDUE, total="10.55")
    _add_bill(db, user, a["id"], status=BillStatus.PAID, total="999.00", amount_paid="999")
    _add_bill(db, user, a["id"], status=BillStatus.DRAFT, total="999.00")
    _add_bill(db, user, a["id"], status=BillStatus.CANCELLED, total="999.00")
    _add_plan(db, user, a["id"], status=PlanStatus.ACTIVE)
    _add_plan(db, user, a["id"], status=PlanStatus.ACTIVE)
    _add_plan(db, user, a["id"], status=PlanStatus.PAUSED)
    _add_plan(db, user, a["id"], status=PlanStatus.CANCELLED)

    items = {c["name"]: c for c in client.get(URL, headers=auth_headers).json()["items"]}
    assert items["Alpha"]["balanceDue"] == "140.55"
    assert items["Alpha"]["activePlanCount"] == 2
    assert items["Beta"]["balanceDue"] == "0.00"
    assert items["Beta"]["activePlanCount"] == 0
    assert b["id"] != a["id"]


# --------------------------------------------------------------------------- detail


def test_detail_includes_balance_plans_bills_payments(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    c = _create(client, auth_headers, "Alpha")
    _add_plan(db, user, c["id"], unit_price="33.33", quantity="3", tax_rate="10")
    sent = _add_bill(db, user, c["id"], status=BillStatus.SENT, total="100.00")
    _add_bill(db, user, c["id"], status=BillStatus.PAID, total="40.00", amount_paid="40.00")
    partial = _add_bill(
        db, user, c["id"], status=BillStatus.PARTIALLY_PAID, total="60.00", amount_paid="25.00"
    )
    _add_payment(db, user, partial, "25.00", datetime(2026, 3, 1, tzinfo=UTC))

    resp = client.get(f"{URL}/{c['id']}", headers=auth_headers)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["id"] == c["id"]
    assert body["balanceDue"] == "135.00"

    assert len(body["plans"]) == 1
    plan = body["plans"][0]
    # 3 x 33.33 = 99.99; tax 10% = 10.00 (half-up) -> 109.99
    assert plan["total"] == "109.99"
    assert plan["frequency"] == "monthly"
    assert plan["intervalCount"] == 1
    assert plan["status"] == "active"
    assert plan["nextBillingDate"] == "2026-02-01"

    assert len(body["recentBills"]) == 3
    bill_ids = {b["id"] for b in body["recentBills"]}
    assert sent.id in bill_ids
    first_bill = body["recentBills"][0]
    assert {"billNumber", "issueDate", "dueDate", "total", "amountPaid", "status"} <= set(
        first_bill
    )

    assert len(body["recentPayments"]) == 1
    pay = body["recentPayments"][0]
    assert pay["billId"] == partial.id
    assert pay["amount"] == "25.00"
    assert pay["method"] == "cash"


def test_detail_recent_bills_limited_to_latest_10(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    c = _create(client, auth_headers, "Alpha")
    bills = [
        _add_bill(
            db,
            user,
            c["id"],
            status=BillStatus.DRAFT,
            total="1.00",
            issue_date=date(2026, 1, 1) + timedelta(days=i),
        )
        for i in range(12)
    ]
    body = client.get(f"{URL}/{c['id']}", headers=auth_headers).json()
    assert len(body["recentBills"]) == 10
    assert body["recentBills"][0]["id"] == bills[-1].id
    assert bills[0].id not in {b["id"] for b in body["recentBills"]}


def test_detail_not_found(client: TestClient, auth_headers: dict[str, str]) -> None:
    resp = client.get(f"{URL}/999999", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "customer_not_found"


# --------------------------------------------------------------------------- update


def test_update_customer(client: TestClient, auth_headers: dict[str, str]) -> None:
    c = _create(client, auth_headers, "Alpha", phone="123", notes="old")
    resp = client.put(
        f"{URL}/{c['id']}",
        json={"name": "Alpha Two", "email": "NEW@Example.com", "notes": None},
        headers=auth_headers,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["name"] == "Alpha Two"
    assert body["email"] == "new@example.com"
    assert body["notes"] is None
    assert body["phone"] == "123"  # untouched


def test_update_duplicate_email_409(client: TestClient, auth_headers: dict[str, str]) -> None:
    _create(client, auth_headers, "Alpha")
    b = _create(client, auth_headers, "Beta")
    resp = client.put(f"{URL}/{b['id']}", json={"email": "alpha@example.com"}, headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "customer_email_exists"
    # Re-saving its own email is fine.
    resp = client.put(f"{URL}/{b['id']}", json={"email": "BETA@example.com"}, headers=auth_headers)
    assert resp.status_code == 200


@pytest.mark.parametrize("payload", [{"email": "bad"}, {"email": None}, {"name": None}])
def test_update_validation_422(
    client: TestClient, auth_headers: dict[str, str], payload: dict[str, Any]
) -> None:
    c = _create(client, auth_headers, "Alpha")
    assert client.put(f"{URL}/{c['id']}", json=payload, headers=auth_headers).status_code == 422


# --------------------------------------------------------------------------- archive


def test_archive_blocked_by_active_or_paused_plan(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    c = _create(client, auth_headers, "Alpha")
    plan = _add_plan(db, user, c["id"], status=PlanStatus.ACTIVE)
    resp = client.delete(f"{URL}/{c['id']}", headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "customer_has_active_plans"

    plan.status = PlanStatus.PAUSED
    db.commit()
    assert client.delete(f"{URL}/{c['id']}", headers=auth_headers).status_code == 409

    plan.status = PlanStatus.CANCELLED
    db.commit()
    assert client.delete(f"{URL}/{c['id']}", headers=auth_headers).status_code == 204


def test_archive_hides_from_default_list_and_unarchive(
    client: TestClient, db: Session, user: User, auth_headers: dict[str, str]
) -> None:
    c = _create(client, auth_headers, "Alpha")
    _add_bill(db, user, c["id"], status=BillStatus.PAID, total="5.00", amount_paid="5.00")
    _create(client, auth_headers, "Beta")

    assert client.delete(f"{URL}/{c['id']}", headers=auth_headers).status_code == 204
    # Soft delete: row still exists.
    db.expire_all()
    row = db.get(Customer, c["id"])
    assert row is not None and row.is_active is False

    active = client.get(URL, headers=auth_headers).json()
    assert [x["name"] for x in active["items"]] == ["Beta"]
    archived = client.get(URL, params={"active": "false"}, headers=auth_headers).json()
    assert [x["name"] for x in archived["items"]] == ["Alpha"]
    assert archived["items"][0]["isActive"] is False
    assert archived["total"] == 1

    # Detail still available for archived customers.
    assert client.get(f"{URL}/{c['id']}", headers=auth_headers).status_code == 200
    # Archiving again is a no-op.
    assert client.delete(f"{URL}/{c['id']}", headers=auth_headers).status_code == 204

    resp = client.put(f"{URL}/{c['id']}", json={"isActive": True}, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["isActive"] is True
    assert {x["name"] for x in client.get(URL, headers=auth_headers).json()["items"]} == {
        "Alpha",
        "Beta",
    }


def test_unarchive_blocked_when_email_taken_by_active_customer(
    client: TestClient, auth_headers: dict[str, str]
) -> None:
    old = _create(client, auth_headers, "Acme")
    assert client.delete(f"{URL}/{old['id']}", headers=auth_headers).status_code == 204
    _create(client, auth_headers, "Acme")  # same email, now allowed
    resp = client.put(f"{URL}/{old['id']}", json={"isActive": True}, headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "customer_email_exists"


# --------------------------------------------------------------------------- tenancy / auth


def test_cross_tenant_access_is_404(
    client: TestClient,
    auth_headers: dict[str, str],
    other_auth_headers: dict[str, str],
) -> None:
    c = _create(client, auth_headers, "Alpha")
    url = f"{URL}/{c['id']}"
    for resp in (
        client.get(url, headers=other_auth_headers),
        client.put(url, json={"name": "Hacked"}, headers=other_auth_headers),
        client.delete(url, headers=other_auth_headers),
    ):
        assert resp.status_code == 404
        assert resp.json()["code"] == "customer_not_found"
    # Owner's record untouched.
    body = client.get(url, headers=auth_headers).json()
    assert body["name"] == "Alpha" and body["isActive"] is True


def test_cross_tenant_bills_do_not_leak_into_balance(
    client: TestClient,
    db: Session,
    user: User,
    other_user: User,
    auth_headers: dict[str, str],
) -> None:
    c = _create(client, auth_headers, "Alpha")
    # A bill wrongly pointing at this customer but owned by another tenant must be ignored.
    _add_bill(db, other_user, c["id"], status=BillStatus.SENT, total="77.00")
    body = client.get(f"{URL}/{c['id']}", headers=auth_headers).json()
    assert body["balanceDue"] == "0.00"
    assert body["recentBills"] == []
    assert user.id != other_user.id


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("get", URL),
        ("post", URL),
        ("get", f"{URL}/1"),
        ("put", f"{URL}/1"),
        ("delete", f"{URL}/1"),
    ],
)
def test_unauthenticated_401(client: TestClient, method: str, path: str) -> None:
    kwargs: dict[str, Any] = {}
    if method in ("post", "put"):
        kwargs["json"] = {"name": "X", "email": "x@example.com"}
    resp = client.request(method.upper(), path, **kwargs)
    assert resp.status_code == 401
