"""Dashboard analytics (Module 7): /api/v1/analytics/*."""

from __future__ import annotations

from collections.abc import Iterator
from datetime import UTC, date, datetime, timedelta, timezone
from decimal import Decimal
from itertools import count
from typing import Any

import pytest
from fastapi.testclient import TestClient
from freezegun import freeze_time
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.jwt import create_access_token
from app.enums import (
    BillingFrequency,
    BillStatus,
    PaymentMethod,
    PaymentProvider,
    PaymentStatus,
    PlanStatus,
)
from app.main import app
from app.models import (
    Bill,
    BillingPlan,
    BusinessProfile,
    Customer,
    Payment,
    PlanLineItem,
    User,
)
from app.routers import analytics as analytics_router
from app.services import analytics_service

API = "/api/v1/analytics"
TODAY = date(2026, 10, 15)
FROZEN_NOW = "2026-10-15 12:00:00"

_seq = count(1)


@pytest.fixture(autouse=True, scope="module")
def _mount_router() -> Iterator[None]:
    """Mount the analytics router if the orchestrator has not wired it into api_router yet."""
    paths = {getattr(r, "path", "") for r in app.routes}
    if f"{API}/summary" not in paths:
        app.include_router(analytics_router.router, prefix="/api/v1")
    yield


def _headers(u: User) -> dict[str, str]:
    # Created inside the frozen clock so the token is valid "now".
    return {"Authorization": f"Bearer {create_access_token(u.id)}"}


# --------------------------------------------------------------------------- factories


def _profile(db: Session, u: User, currency: str = "USD") -> BusinessProfile:
    p = BusinessProfile(user_id=u.id, business_name="Acme", default_currency=currency)
    db.add(p)
    db.flush()
    return p


def _customer(db: Session, u: User, name: str, *, active: bool = True) -> Customer:
    c = Customer(user_id=u.id, name=name, email=f"{name.lower()}{next(_seq)}@x.com")
    c.is_active = active
    db.add(c)
    db.flush()
    return c


def _plan(
    db: Session,
    u: User,
    c: Customer,
    frequency: BillingFrequency,
    items: list[tuple[str, str]],
    *,
    interval: int = 1,
    tax: str = "0",
    currency: str = "USD",
    status: PlanStatus = PlanStatus.ACTIVE,
    next_date: date = date(2026, 12, 1),
    name: str | None = None,
) -> BillingPlan:
    p = BillingPlan(
        user_id=u.id,
        customer_id=c.id,
        name=name or f"{frequency.value}-{interval}",
        currency=currency,
        frequency=frequency,
        interval_count=interval,
        start_date=date(2026, 1, 1),
        next_billing_date=next_date,
        tax_rate=Decimal(tax),
        status=status,
    )
    p.line_items = [
        PlanLineItem(
            description=f"item {i}", quantity=Decimal(q), unit_price=Decimal(up), position=i
        )
        for i, (q, up) in enumerate(items)
    ]
    db.add(p)
    db.flush()
    return p


def _bill(
    db: Session,
    u: User,
    c: Customer,
    status: BillStatus,
    total: str,
    *,
    paid: str = "0",
    due: date = TODAY,
    issue: date = TODAY,
    currency: str = "USD",
) -> Bill:
    b = Bill(
        user_id=u.id,
        customer_id=c.id,
        bill_number=f"BM-{next(_seq)}",
        issue_date=issue,
        due_date=due,
        currency=currency,
        subtotal=Decimal(total),
        total=Decimal(total),
        amount_paid=Decimal(paid),
        status=status,
    )
    db.add(b)
    db.flush()
    return b


def _payment(
    db: Session,
    u: User,
    b: Bill,
    amount: str,
    paid_at: datetime,
    *,
    status: PaymentStatus = PaymentStatus.SUCCEEDED,
    currency: str = "USD",
) -> Payment:
    p = Payment(
        user_id=u.id,
        bill_id=b.id,
        amount=Decimal(amount),
        currency=currency,
        method=PaymentMethod.CASH,
        provider=PaymentProvider.MANUAL,
        status=status,
        paid_at=paid_at,
    )
    db.add(p)
    db.flush()
    return p


def _utc(*args: int) -> datetime:
    return datetime(*args, tzinfo=UTC)  # type: ignore[misc]


def _ago(days: int) -> date:
    return TODAY - timedelta(days=days)


# --------------------------------------------------------------------------- summary


@pytest.fixture()
def summary_data(db: Session, user: User, other_user: User) -> dict[str, Any]:
    _profile(db, user, "USD")
    alpha = _customer(db, user, "Alpha")
    beta = _customer(db, user, "Beta")
    _customer(db, user, "Gamma")
    _customer(db, user, "Archived", active=False)

    # MRR plans (USD, active):
    p1 = _plan(db, user, alpha, BillingFrequency.WEEKLY, [("2", "50.00")], next_date=TODAY)
    # 99.99 + round(1.5 * 33.33 = 49.995) = 149.99; tax 10% = 14.999 -> 15.00; total 164.99
    p2 = _plan(
        db,
        user,
        beta,
        BillingFrequency.MONTHLY,
        [("1", "99.99"), ("1.5", "33.33")],
        tax="10",
        next_date=TODAY + timedelta(days=7),
    )
    _plan(db, user, alpha, BillingFrequency.QUARTERLY, [("3", "100.00")], next_date=_ago(-8))
    _plan(db, user, alpha, BillingFrequency.YEARLY, [("1", "1200.00")], next_date=_ago(1))
    p5 = _plan(
        db, user, beta, BillingFrequency.MONTHLY, [("1", "50.00")], interval=2, next_date=_ago(-3)
    )
    _plan(db, user, beta, BillingFrequency.WEEKLY, [("1", "10.01")], interval=2)
    # Not counted in MRR:
    _plan(
        db,
        user,
        alpha,
        BillingFrequency.MONTHLY,
        [("1", "1000")],
        status=PlanStatus.PAUSED,
        next_date=_ago(-1),
    )
    _plan(db, user, alpha, BillingFrequency.MONTHLY, [("1", "1000")], status=PlanStatus.CANCELLED)
    eur = _plan(
        db,
        user,
        alpha,
        BillingFrequency.MONTHLY,
        [("1", "500")],
        currency="EUR",
        next_date=_ago(-1),
        name="Euro plan",
    )
    # Another tenant (must not leak).
    stranger = _customer(db, other_user, "Stranger")
    _plan(db, other_user, stranger, BillingFrequency.MONTHLY, [("1", "777")], next_date=TODAY)
    sb = _bill(db, other_user, stranger, BillStatus.OVERDUE, "5000", due=_ago(40))
    _payment(db, other_user, sb, "4000", _utc(2026, 10, 2))

    # Bills.
    _bill(db, user, alpha, BillStatus.SENT, "100", due=_ago(-5))
    _bill(db, user, alpha, BillStatus.PARTIALLY_PAID, "200", paid="50", due=_ago(5))
    _bill(db, user, alpha, BillStatus.OVERDUE, "300", due=_ago(30))
    _bill(db, user, alpha, BillStatus.OVERDUE, "40", due=_ago(31))
    _bill(db, user, beta, BillStatus.OVERDUE, "60", due=_ago(60))
    _bill(db, user, beta, BillStatus.OVERDUE, "61", due=_ago(61))
    _bill(db, user, beta, BillStatus.OVERDUE, "90", due=_ago(90))
    _bill(db, user, beta, BillStatus.OVERDUE, "91", due=_ago(91))
    _bill(db, user, beta, BillStatus.PARTIALLY_PAID, "500", paid="100", due=TODAY)
    _bill(db, user, beta, BillStatus.SENT, "70", due=_ago(14))
    paid_bill = _bill(db, user, alpha, BillStatus.PAID, "1000", paid="1000", due=_ago(20))
    _bill(db, user, alpha, BillStatus.DRAFT, "999", due=_ago(50))
    _bill(db, user, alpha, BillStatus.CANCELLED, "888", due=_ago(50))
    _bill(db, user, alpha, BillStatus.OVERDUE, "123", due=_ago(45), currency="EUR")

    # Payments this month: 25.00 + 12.50 succeeded USD.
    _payment(db, user, paid_bill, "25.00", _utc(2026, 10, 1, 0, 0, 0))
    _payment(db, user, paid_bill, "12.50", _utc(2026, 10, 15, 10, 0, 0))
    _payment(db, user, paid_bill, "1000", _utc(2026, 9, 30, 23, 59, 59))  # last month
    _payment(db, user, paid_bill, "300", _utc(2026, 10, 5), status=PaymentStatus.REFUNDED)
    _payment(db, user, paid_bill, "400", _utc(2026, 10, 6), status=PaymentStatus.FAILED)
    _payment(db, user, paid_bill, "77", _utc(2026, 10, 3), currency="GBP")
    db.commit()
    return {"p1": p1, "p2": p2, "p5": p5, "eur": eur, "alpha": alpha, "beta": beta}


def test_summary_figures(client: TestClient, user: User, summary_data: dict[str, Any]) -> None:
    with freeze_time(FROZEN_NOW):
        resp = client.get(f"{API}/summary", headers=_headers(user))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    # 433.3333.. (weekly 100 x 52/12) + 164.99 + 100 + 100 + 25 + 21.68833.. (10.01 x 52/24)
    # = 845.0216.. -> 845.02 (per-plan rounding would give 845.01).
    assert body["mrr"] == "845.02"
    assert body["currency"] == "USD"
    assert body["collectedThisMonth"] == "37.50"
    assert body["outstanding"] == "1362.00"
    assert body["overdueAmount"] == "792.00"
    assert body["overdueCount"] == 7
    assert body["activePlans"] == 7  # 6 USD + 1 EUR; paused/cancelled/other tenant excluded
    assert body["activeCustomers"] == 3
    assert body["excludedCurrencies"] == ["EUR", "GBP"]

    upcoming = body["upcomingBills"]
    assert [u["planId"] for u in upcoming] == [
        summary_data["p1"].id,
        summary_data["eur"].id,
        summary_data["p5"].id,
        summary_data["p2"].id,
    ]
    assert upcoming[0] == {
        "planId": summary_data["p1"].id,
        "planName": "weekly-1",
        "customerId": summary_data["alpha"].id,
        "customerName": "Alpha",
        "nextBillingDate": "2026-10-15",
        "total": "100.00",
        "currency": "USD",
    }
    assert upcoming[1]["currency"] == "EUR"
    assert upcoming[1]["total"] == "500.00"
    assert upcoming[3]["total"] == "164.99"
    assert upcoming[3]["nextBillingDate"] == "2026-10-22"


def test_summary_upcoming_limited_to_ten(client: TestClient, db: Session, user: User) -> None:
    c = _customer(db, user, "Many")
    for i in range(12):
        _plan(
            db, user, c, BillingFrequency.MONTHLY, [("1", "1")], next_date=TODAY + timedelta(i % 8)
        )
    db.commit()
    with freeze_time(FROZEN_NOW):
        body = client.get(f"{API}/summary", headers=_headers(user)).json()
    dates = [u["nextBillingDate"] for u in body["upcomingBills"]]
    assert len(dates) == 10
    assert dates == sorted(dates)


def test_summary_other_tenant_sees_only_own(
    client: TestClient, other_user: User, summary_data: dict[str, Any]
) -> None:
    with freeze_time(FROZEN_NOW):
        body = client.get(f"{API}/summary", headers=_headers(other_user)).json()
    assert body["mrr"] == "777.00"
    assert body["outstanding"] == "5000.00"
    assert body["overdueCount"] == 1
    assert body["collectedThisMonth"] == "4000.00"
    assert body["activePlans"] == 1
    assert body["activeCustomers"] == 1
    assert body["excludedCurrencies"] == []
    assert [u["customerName"] for u in body["upcomingBills"]] == ["Stranger"]


def test_summary_without_profile_defaults_to_usd(
    client: TestClient, db: Session, user: User
) -> None:
    c = _customer(db, user, "Solo")
    _plan(db, user, c, BillingFrequency.MONTHLY, [("1", "10")])
    _plan(db, user, c, BillingFrequency.MONTHLY, [("1", "99")], currency="INR")
    db.commit()
    with freeze_time(FROZEN_NOW):
        body = client.get(f"{API}/summary", headers=_headers(user)).json()
    assert body["currency"] == "USD"
    assert body["mrr"] == "10.00"
    assert body["excludedCurrencies"] == ["INR"]
    assert body["upcomingBills"] == []


def test_summary_uses_profile_currency(client: TestClient, db: Session, user: User) -> None:
    _profile(db, user, "EUR")
    c = _customer(db, user, "Euro")
    _plan(db, user, c, BillingFrequency.YEARLY, [("1", "120")], currency="EUR")
    _plan(db, user, c, BillingFrequency.MONTHLY, [("1", "10")])
    db.commit()
    with freeze_time(FROZEN_NOW):
        body = client.get(f"{API}/summary", headers=_headers(user)).json()
    assert body["currency"] == "EUR"
    assert body["mrr"] == "10.00"
    assert body["excludedCurrencies"] == ["USD"]


def test_summary_empty(client: TestClient, user: User) -> None:
    with freeze_time(FROZEN_NOW):
        body = client.get(f"{API}/summary", headers=_headers(user)).json()
    assert body == {
        "currency": "USD",
        "mrr": "0.00",
        "collectedThisMonth": "0.00",
        "outstanding": "0.00",
        "overdueAmount": "0.00",
        "overdueCount": 0,
        "activePlans": 0,
        "activeCustomers": 0,
        "upcomingBills": [],
        "excludedCurrencies": [],
    }


def test_sql_plan_total_matches_compute_totals(db: Session, user: User) -> None:
    from app.services.billing_engine import compute_totals

    c = _customer(db, user, "Math")
    cases = [
        ([("1", "99.99"), ("1.5", "33.33")], "10"),
        ([("3", "0.335"[:4]), ("2.25", "19.99"), ("0.5", "0.01")], "7.25"),
        ([("1", "0.05")], "12.5"),
        ([("7", "14.29")], "0"),
        ([("1.33", "3.33"), ("2", "1.11")], "18.75"),
    ]
    plans = [_plan(db, user, c, BillingFrequency.MONTHLY, items, tax=tax) for items, tax in cases]
    db.commit()
    sub = analytics_service.plan_totals_subquery(user.id)
    sql_totals = dict(db.execute(select(sub.c.plan_id, sub.c.total)).tuples().all())
    for plan in plans:
        db.refresh(plan)
        expected = compute_totals(plan.line_items, plan.tax_rate).total
        assert Decimal(sql_totals[plan.id]) == expected, plan.id


def test_mrr_query_is_single_aggregate(db: Session, user: User) -> None:
    c = _customer(db, user, "Agg")
    _plan(db, user, c, BillingFrequency.WEEKLY, [("1", "12")])
    _plan(db, user, c, BillingFrequency.QUARTERLY, [("1", "30")], interval=2)
    db.commit()
    active_plans, mrr = db.execute(analytics_service.mrr_query(user.id, "USD")).one()
    assert active_plans == 2
    # 12 x 52/12 = 52 ; 30 / (3 x 2) = 5
    assert Decimal(mrr).quantize(Decimal("0.01")) == Decimal("57.00")


# --------------------------------------------------------------------------- revenue


def test_revenue_zero_filled_and_month_boundaries(
    client: TestClient, db: Session, user: User, other_user: User
) -> None:
    _profile(db, user, "USD")
    c = _customer(db, user, "Rev")
    _bill(db, user, c, BillStatus.SENT, "999", issue=date(2025, 11, 30))  # before window
    dec = _bill(db, user, c, BillStatus.SENT, "10", issue=date(2025, 12, 1))
    _bill(db, user, c, BillStatus.PAID, "20", paid="20", issue=date(2026, 1, 31))
    _bill(db, user, c, BillStatus.DRAFT, "999", issue=date(2026, 1, 15))
    _bill(db, user, c, BillStatus.CANCELLED, "888", issue=date(2026, 1, 16))
    _bill(db, user, c, BillStatus.OVERDUE, "30", issue=date(2026, 3, 10))
    _bill(db, user, c, BillStatus.SENT, "40", issue=date(2026, 4, 1))  # next month
    _bill(db, user, c, BillStatus.SENT, "55", issue=date(2026, 2, 10), currency="EUR")

    _payment(db, user, dec, "999", _utc(2025, 11, 30, 23, 59, 59))  # before window
    _payment(db, user, dec, "5", _utc(2025, 12, 1, 0, 0, 0))
    _payment(db, user, dec, "7", _utc(2026, 2, 28, 23, 59, 59))
    # 2026-03-01 00:30 +02:00 == 2026-02-28 22:30 UTC -> February.
    _payment(db, user, dec, "3", datetime(2026, 3, 1, 0, 30, tzinfo=timezone(timedelta(hours=2))))
    _payment(db, user, dec, "100", _utc(2026, 1, 5), status=PaymentStatus.FAILED)
    _payment(db, user, dec, "200", _utc(2026, 1, 6), status=PaymentStatus.REFUNDED)
    _payment(db, user, dec, "50", _utc(2026, 1, 7), currency="EUR")
    oc = _customer(db, other_user, "OtherRev")
    ob = _bill(db, other_user, oc, BillStatus.SENT, "4444", issue=date(2026, 1, 2))
    _payment(db, other_user, ob, "4444", _utc(2026, 1, 3))
    db.commit()

    with freeze_time("2026-03-10 08:00:00"):
        headers = _headers(user)
        resp = client.get(f"{API}/revenue", params={"months": 4}, headers=headers)
        default = client.get(f"{API}/revenue", headers=headers).json()
    assert resp.status_code == 200, resp.text
    assert resp.json() == [
        {"month": "2025-12", "billed": "10.00", "collected": "5.00"},
        {"month": "2026-01", "billed": "20.00", "collected": "0.00"},
        {"month": "2026-02", "billed": "0.00", "collected": "10.00"},
        {"month": "2026-03", "billed": "30.00", "collected": "0.00"},
    ]
    assert len(default) == 12
    assert default[0]["month"] == "2025-04"
    assert default[-1]["month"] == "2026-03"
    assert default[7]["month"] == "2025-11"
    assert default[7] == {"month": "2025-11", "billed": "999.00", "collected": "999.00"}


def test_revenue_single_month(client: TestClient, user: User) -> None:
    with freeze_time("2026-01-31 23:00:00"):
        body = client.get(f"{API}/revenue", params={"months": 1}, headers=_headers(user)).json()
    assert body == [{"month": "2026-01", "billed": "0.00", "collected": "0.00"}]


# --------------------------------------------------------------------------- aging


def test_aging_buckets(
    client: TestClient, user: User, other_user: User, summary_data: dict[str, Any]
) -> None:
    with freeze_time(FROZEN_NOW):
        resp = client.get(f"{API}/aging", headers=_headers(user))
        other = client.get(f"{API}/aging", headers=_headers(other_user)).json()
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "currency": "USD",
        "buckets": [
            # 5d (150 unpaid of 200), 14d (sent, 70), 30d (300)
            {"label": "0-30", "amount": "520.00", "count": 3},
            {"label": "31-60", "amount": "100.00", "count": 2},  # 31d 40, 60d 60
            {"label": "61-90", "amount": "151.00", "count": 2},  # 61d 61, 90d 90
            {"label": "90+", "amount": "91.00", "count": 1},  # 91d
        ],
    }
    assert other["buckets"][1] == {"label": "31-60", "amount": "5000.00", "count": 1}
    assert sum(b["count"] for b in other["buckets"]) == 1


# --------------------------------------------------------------------------- top customers


def test_top_customers_ordering_and_limit(
    client: TestClient, db: Session, user: User, other_user: User
) -> None:
    _profile(db, user, "USD")
    names = ["Alpha", "Bravo", "Charlie", "Delta", "Echo", "Foxtrot"]
    cs = {n: _customer(db, user, n) for n in names}
    bills = {n: _bill(db, user, c, BillStatus.PAID, "1") for n, c in cs.items()}
    _payment(db, user, bills["Alpha"], "100", _utc(2026, 9, 1))
    _payment(db, user, bills["Alpha"], "50", _utc(2025, 10, 15, 0, 0, 0))  # window start
    _payment(db, user, bills["Bravo"], "300", _utc(2026, 1, 1))
    _payment(db, user, bills["Charlie"], "150", _utc(2026, 2, 1))
    _payment(db, user, bills["Delta"], "10", _utc(2026, 3, 1))
    _payment(db, user, bills["Delta"], "5000", _utc(2026, 3, 1), currency="EUR")
    _payment(db, user, bills["Echo"], "9999", _utc(2025, 10, 14, 23, 59, 59))  # too old
    _payment(db, user, bills["Echo"], "1", _utc(2026, 10, 14))
    _payment(db, user, bills["Foxtrot"], "800", _utc(2026, 5, 1), status=PaymentStatus.REFUNDED)
    _payment(db, user, bills["Foxtrot"], "900", _utc(2026, 5, 2), status=PaymentStatus.FAILED)
    oc = _customer(db, other_user, "Zulu")
    ob = _bill(db, other_user, oc, BillStatus.PAID, "1")
    _payment(db, other_user, ob, "100000", _utc(2026, 5, 1))
    db.commit()

    with freeze_time(FROZEN_NOW):
        headers = _headers(user)
        top3 = client.get(f"{API}/top-customers", params={"limit": 3}, headers=headers)
        default = client.get(f"{API}/top-customers", headers=headers).json()
    assert top3.status_code == 200, top3.text
    assert top3.json() == [
        {"customerId": cs["Bravo"].id, "customerName": "Bravo", "collected": "300.00"},
        {"customerId": cs["Alpha"].id, "customerName": "Alpha", "collected": "150.00"},
        {"customerId": cs["Charlie"].id, "customerName": "Charlie", "collected": "150.00"},
    ]
    assert [(c["customerName"], c["collected"]) for c in default] == [
        ("Bravo", "300.00"),
        ("Alpha", "150.00"),
        ("Charlie", "150.00"),
        ("Delta", "10.00"),
        ("Echo", "1.00"),
    ]


# --------------------------------------------------------------------------- validation & auth


@pytest.mark.parametrize(
    ("path", "params"),
    [
        ("revenue", {"months": 0}),
        ("revenue", {"months": 25}),
        ("top-customers", {"limit": 0}),
        ("top-customers", {"limit": 21}),
    ],
)
def test_query_validation(
    client: TestClient, auth_headers: dict[str, str], path: str, params: dict[str, int]
) -> None:
    assert client.get(f"{API}/{path}", params=params, headers=auth_headers).status_code == 422


@pytest.mark.parametrize(
    ("path", "params"), [("revenue", {"months": 24}), ("top-customers", {"limit": 20})]
)
def test_query_upper_bounds_accepted(
    client: TestClient, auth_headers: dict[str, str], path: str, params: dict[str, int]
) -> None:
    resp = client.get(f"{API}/{path}", params=params, headers=auth_headers)
    assert resp.status_code == 200, resp.text


@pytest.mark.parametrize("path", ["summary", "revenue", "aging", "top-customers"])
def test_requires_auth(client: TestClient, path: str) -> None:
    assert client.get(f"{API}/{path}").status_code == 401
