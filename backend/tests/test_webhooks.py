"""API tests for the Dodo webhook (``POST /api/v1/webhooks/dodo``)."""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.enums import BillStatus, PaymentProvider, PaymentStatus
from app.models import Bill, Payment, User, WebhookEvent
from tests.helpers import make_bill, make_customer

URL = "/api/v1/webhooks/dodo"


@pytest.fixture()
def _stub_signature(monkeypatch: pytest.MonkeyPatch, db: Session) -> None:
    """Skip real signature checks (covered separately) and reuse the per-test session."""

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db  # not closed: the test transaction owns it

    monkeypatch.setattr("app.routers.webhooks.SessionLocal", _session)
    monkeypatch.setattr(
        "app.services.dodo_service.verify_webhook", lambda raw, headers: json.loads(raw)
    )


def _succeeded(bill: Bill, payment_id: str = "pay_1", minor: int = 10000, **meta: Any) -> dict:
    return {
        "type": "payment.succeeded",
        "data": {
            "payment_id": payment_id,
            "total_amount": minor,
            "currency": bill.currency,
            "metadata": {"bill_id": str(bill.id), "user_id": str(bill.user_id), **meta},
        },
    }


def _post(client: TestClient, payload: dict[str, Any], event_id: str = "evt_1") -> Any:
    return client.post(URL, json=payload, headers={"webhook-id": event_id})


@pytest.mark.usefixtures("_stub_signature")
class TestVerifiedEvents:
    def test_payment_succeeded_marks_bill_paid_and_sends_receipt(
        self, client: TestClient, db: Session, user: User, sent_emails: list[dict[str, Any]]
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user), total="100.00")
        resp = _post(client, _succeeded(bill))
        assert resp.status_code == 200 and resp.json() == {"status": "processed"}
        db.refresh(bill)
        assert (bill.status, str(bill.amount_paid)) == (BillStatus.PAID, "100.00")
        payment = db.scalars(select(Payment).where(Payment.bill_id == bill.id)).one()
        assert payment.provider == PaymentProvider.DODO
        assert payment.provider_payment_id == "pay_1"
        assert payment.status == PaymentStatus.SUCCEEDED
        assert len(sent_emails) == 1
        event = db.scalars(select(WebhookEvent)).one()
        assert event.event_id == "evt_1" and event.processed_at is not None

    def test_partial_payment_leaves_bill_partially_paid(
        self, client: TestClient, db: Session, user: User
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user), total="100.00")
        assert _post(client, _succeeded(bill, minor=3000)).json() == {"status": "processed"}
        db.refresh(bill)
        assert (bill.status, str(bill.amount_paid)) == (BillStatus.PARTIALLY_PAID, "30.00")

    def test_duplicate_event_is_noop(self, client: TestClient, db: Session, user: User) -> None:
        bill = make_bill(db, user, make_customer(db, user))
        assert _post(client, _succeeded(bill)).json() == {"status": "processed"}
        again = _post(client, _succeeded(bill))
        assert again.status_code == 200 and again.json() == {"status": "duplicate"}
        assert db.scalar(select(func.count(Payment.id))) == 1

    def test_same_payment_under_new_event_id_not_double_counted(
        self, client: TestClient, db: Session, user: User
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user))
        _post(client, _succeeded(bill), event_id="evt_a")
        _post(client, _succeeded(bill), event_id="evt_b")
        assert db.scalar(select(func.count(Payment.id))) == 1
        db.refresh(bill)
        assert str(bill.amount_paid) == "100.00"

    def test_matches_bill_by_checkout_session(
        self, client: TestClient, db: Session, user: User
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user), checkout_id="cks_9")
        payload = {
            "type": "payment.succeeded",
            "data": {
                "payment_id": "pay_9",
                "total_amount": 10000,
                "currency": "USD",
                "checkout_session_id": "cks_9",
            },
        }
        assert _post(client, payload).json() == {"status": "processed"}
        db.refresh(bill)
        assert bill.status == BillStatus.PAID

    def test_unmatched_bill_is_stored_unprocessed(self, client: TestClient, db: Session) -> None:
        payload = {
            "type": "payment.succeeded",
            "data": {
                "payment_id": "pay_x",
                "total_amount": 100,
                "currency": "USD",
                "metadata": {"bill_id": "424242"},
            },
        }
        assert _post(client, payload).json() == {"status": "unmatched"}
        assert db.scalars(select(WebhookEvent)).one().processed_at is None
        assert db.scalar(select(func.count(Payment.id))) == 0

    def test_metadata_user_mismatch_not_applied(
        self, client: TestClient, db: Session, user: User, other_user: User
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user))
        payload = _succeeded(bill, user_id=str(other_user.id))
        assert _post(client, payload).json() == {"status": "unmatched"}
        db.refresh(bill)
        assert bill.amount_paid == 0

    def test_unknown_event_type_ignored(self, client: TestClient, db: Session) -> None:
        resp = _post(client, {"type": "subscription.active", "data": {}})
        assert resp.status_code == 200 and resp.json() == {"status": "ignored"}
        assert db.scalars(select(WebhookEvent)).one().event_type == "subscription.active"

    def test_payment_failed_does_not_pay_bill(
        self, client: TestClient, db: Session, user: User
    ) -> None:
        bill = make_bill(db, user, make_customer(db, user))
        payload = _succeeded(bill)
        payload["type"] = "payment.failed"
        assert _post(client, payload).status_code == 200
        db.refresh(bill)
        assert bill.status == BillStatus.SENT and bill.amount_paid == 0

    def test_refund_reverses_payment(self, client: TestClient, db: Session, user: User) -> None:
        bill = make_bill(db, user, make_customer(db, user), total="100.00")
        _post(client, _succeeded(bill), event_id="evt_pay")
        refund = {
            "type": "refund.succeeded",
            "data": {
                "payment_id": "pay_1",
                "refund_id": "ref_1",
                "amount": 10000,
                "currency": "USD",
                "is_partial": False,
            },
        }
        assert _post(client, refund, event_id="evt_ref").status_code == 200
        db.refresh(bill)
        assert bill.amount_paid == 0 and bill.status != BillStatus.PAID


# --------------------------------------------------------------------------- signature


def test_invalid_signature_rejected_with_401(client: TestClient, db: Session) -> None:
    resp = client.post(
        URL,
        json={"type": "payment.succeeded"},
        headers={
            "webhook-id": "evt_bad",
            "webhook-timestamp": "1",
            "webhook-signature": "v1,bogus",
        },
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "invalid_signature"
    assert db.scalar(select(func.count(WebhookEvent.id))) == 0


def test_missing_signature_headers_rejected(client: TestClient) -> None:
    assert client.post(URL, json={"type": "payment.succeeded"}).status_code == 401
