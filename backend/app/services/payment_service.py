"""Payments business logic (Module 6): manual payments, listing and Dodo webhook events.

Invariants
    * ``bill.amount_paid`` is always the sum of *succeeded* payments, recomputed by
      :func:`app.services.billing_engine.recalc_bill_status` after every payment change.
    * Every write that changes a bill's payments first locks the bill row
      (``SELECT ... FOR UPDATE``), so concurrent manual payments / webhooks cannot
      overpay or double-count.
    * Webhooks are idempotent twice over: ``WebhookEvent.event_id`` is unique (a replayed
      delivery is a no-op) and ``Payment.provider_payment_id`` is unique (a payment is
      recorded at most once even if Dodo emits it under several event ids).
    * Receipt emails are sent *after* the payment transaction commits, so an email failure
      can never roll a payment back.
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any, Literal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.enums import (
    BillStatus,
    EmailTemplate,
    PaymentMethod,
    PaymentProvider,
    PaymentStatus,
)
from app.exceptions import BadRequestError, ConflictError, NotFoundError
from app.models import Bill, BusinessProfile, Customer, Payment, User, WebhookEvent
from app.schemas.base import PageParams
from app.schemas.payment import MANUAL_METHODS, ManualPaymentCreate, PaymentOut
from app.services import dodo_service
from app.services.billing_engine import quantize, recalc_bill_status
from app.services.dodo_service import DodoEvent
from app.services.email_service import send_email

logger = logging.getLogger(__name__)

WebhookResult = Literal["processed", "duplicate", "unmatched", "ignored"]

NON_PAYABLE_BILL_STATUSES: tuple[BillStatus, ...] = (BillStatus.DRAFT, BillStatus.CANCELLED)
_NOTES_MAX = 2000


def _today() -> date:
    return datetime.now(UTC).date()


# --------------------------------------------------------------------------- helpers


def _lock_bill(db: Session, *filters: ColumnElement[bool]) -> Bill | None:
    """Load a bill with ``SELECT ... FOR UPDATE`` (refreshing any stale identity-map copy)."""
    return db.scalar(
        select(Bill).where(*filters).with_for_update().execution_options(populate_existing=True)
    )


def _refresh_status(db: Session, bill: Bill) -> None:
    """Reload the bill's payments and recompute ``amount_paid`` / ``status``.

    If the balance changed, any existing Dodo pay link (created for the old balance) is
    dropped so :func:`dodo_service.ensure_payment_link` creates one for the new balance.
    """
    db.flush()
    db.refresh(bill, attribute_names=["payments"])
    previous_paid = bill.amount_paid
    recalc_bill_status(bill, _today())
    if bill.amount_paid != previous_paid and bill.payment_link_url:
        bill.payment_link_url = None
        bill.dodo_checkout_id = None
    db.flush()


def _business_name(db: Session, user_id: int) -> str:
    name = db.scalar(
        select(BusinessProfile.business_name).where(BusinessProfile.user_id == user_id)
    )
    if name:
        return name
    owner = db.execute(select(User.full_name, User.email).where(User.id == user_id)).first()
    if owner is None:
        return "Your supplier"
    return owner.full_name or owner.email


def _pay_url(bill: Bill) -> str:
    from app.config import settings

    return f"{settings.APP_BASE_URL.rstrip('/')}/pay/{bill.public_token}"


def send_receipt(db: Session, bill: Bill, payment: Payment) -> None:
    """Email a ``receipt`` to the bill's customer and commit the ``EmailLog``.

    Must be called after the payment has been committed. Never raises.
    """
    try:
        customer = bill.customer
        balance = quantize(Decimal(bill.total) - Decimal(bill.amount_paid))
        send_email(
            db,
            to=customer.email,
            template=EmailTemplate.RECEIPT,
            context={
                "business_name": _business_name(db, bill.user_id),
                "customer_name": customer.name,
                "bill_number": bill.bill_number,
                "amount_paid": str(quantize(Decimal(payment.amount))),
                "currency": payment.currency,
                "total": str(quantize(Decimal(bill.total))),
                "pay_url": _pay_url(bill),
                "balance_due": str(balance) if balance > 0 else None,
                "paid_at": payment.paid_at.date().isoformat() if payment.paid_at else None,
                "due_date": bill.due_date.isoformat(),
            },
            user_id=bill.user_id,
            bill_id=bill.id,
        )
        db.commit()
    except Exception:
        db.rollback()
        logger.exception("Could not send/log receipt for bill_id=%s", bill.id)


def _to_out(payment: Payment, bill: Bill) -> PaymentOut:
    return PaymentOut(
        id=payment.id,
        bill_id=bill.id,
        bill_number=bill.bill_number,
        customer_id=bill.customer_id,
        customer_name=bill.customer.name,
        amount=payment.amount,
        currency=payment.currency,
        method=payment.method,
        provider=payment.provider,
        provider_payment_id=payment.provider_payment_id,
        status=payment.status,
        paid_at=payment.paid_at,
        notes=payment.notes,
        created_at=payment.created_at,
    )


# --------------------------------------------------------------------------- listing


def list_payments(
    db: Session,
    user: User,
    params: PageParams,
    *,
    customer_id: int | None = None,
    method: PaymentMethod | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[PaymentOut], int]:
    """The user's payments, newest ``paid_at`` first, with bill number + customer name.

    ``date_from`` / ``date_to`` are inclusive UTC dates on ``paid_at``.
    """
    filters: list[ColumnElement[bool]] = [Payment.user_id == user.id]
    if customer_id is not None:
        filters.append(Bill.customer_id == customer_id)
    if method is not None:
        filters.append(Payment.method == method)
    if date_from is not None:
        filters.append(Payment.paid_at >= datetime.combine(date_from, time.min, tzinfo=UTC))
    if date_to is not None:
        end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=UTC)
        filters.append(Payment.paid_at < end)

    total = db.scalar(
        select(func.count(Payment.id)).join(Bill, Bill.id == Payment.bill_id).where(*filters)
    )
    rows = db.execute(
        select(
            Payment.id,
            Payment.bill_id,
            Bill.bill_number,
            Bill.customer_id,
            Customer.name.label("customer_name"),
            Payment.amount,
            Payment.currency,
            Payment.method,
            Payment.provider,
            Payment.provider_payment_id,
            Payment.status,
            Payment.paid_at,
            Payment.notes,
            Payment.created_at,
        )
        .join(Bill, Bill.id == Payment.bill_id)
        .join(Customer, Customer.id == Bill.customer_id)
        .where(*filters)
        .order_by(Payment.paid_at.desc(), Payment.id.desc())
        .offset(params.offset)
        .limit(params.limit)
    ).all()
    items = [PaymentOut.model_validate(row._mapping) for row in rows]
    return items, int(total or 0)


# --------------------------------------------------------------------------- manual payments


def record_manual_payment(
    db: Session, user: User, bill_id: int, data: ManualPaymentCreate
) -> PaymentOut:
    """Record a cash / bank transfer / cheque / other payment against one of the user's bills.

    Raises:
        NotFoundError(bill_not_found): no such bill for this user.
        BadRequestError(invalid_method): ``online`` (reserved for Dodo).
        ConflictError(bill_not_payable): the bill is a draft or cancelled.
        BadRequestError(overpayment): amount exceeds the balance due.
    """
    if data.method not in MANUAL_METHODS:
        raise BadRequestError(
            "Online payments are recorded automatically by the payment provider",
            code="invalid_method",
        )
    bill = _lock_bill(db, Bill.id == bill_id, Bill.user_id == user.id)
    if bill is None:
        raise NotFoundError("Bill not found", code="bill_not_found")
    if bill.status in NON_PAYABLE_BILL_STATUSES:
        raise ConflictError(
            f"Payments cannot be recorded on a {bill.status.value} bill", code="bill_not_payable"
        )
    amount = quantize(data.amount)
    balance = quantize(Decimal(bill.total) - Decimal(bill.amount_paid))
    if amount <= 0 or amount > balance:
        raise BadRequestError(
            f"Amount exceeds the balance due ({balance} {bill.currency})", code="overpayment"
        )

    payment = Payment(
        user_id=user.id,
        bill_id=bill.id,
        amount=amount,
        currency=bill.currency,
        method=data.method,
        provider=PaymentProvider.MANUAL,
        provider_payment_id=None,
        status=PaymentStatus.SUCCEEDED,
        paid_at=data.paid_at or datetime.now(UTC),
        notes=data.notes,
    )
    db.add(payment)
    _refresh_status(db, bill)
    db.commit()
    db.refresh(payment)
    logger.info(
        "Manual payment id=%s recorded on bill_id=%s (status now %s)",
        payment.id,
        bill.id,
        bill.status.value,
    )
    out = _to_out(payment, bill)
    send_receipt(db, bill, payment)
    return out


def delete_manual_payment(db: Session, user: User, payment_id: int) -> None:
    """Delete a manual payment and recompute the bill.

    Raises:
        NotFoundError(payment_not_found): no such payment for this user.
        ConflictError(payment_not_deletable): the payment came from Dodo.
    """
    payment = db.scalar(select(Payment).where(Payment.id == payment_id, Payment.user_id == user.id))
    if payment is None:
        raise NotFoundError("Payment not found", code="payment_not_found")
    if payment.provider != PaymentProvider.MANUAL:
        raise ConflictError(
            "Online payments cannot be deleted; refund them in Dodo Payments instead",
            code="payment_not_deletable",
        )
    bill = _lock_bill(db, Bill.id == payment.bill_id, Bill.user_id == user.id)
    if bill is None:  # pragma: no cover - FK guarantees the bill exists
        raise NotFoundError("Payment not found", code="payment_not_found")
    db.delete(payment)
    _refresh_status(db, bill)
    db.commit()
    logger.info("Manual payment id=%s deleted from bill_id=%s", payment_id, bill.id)


# --------------------------------------------------------------------------- Dodo webhooks


def _store_event(db: Session, event: DodoEvent, raw_payload: dict[str, Any]) -> WebhookEvent | None:
    """Insert the WebhookEvent inside a SAVEPOINT; ``None`` if ``event_id`` already exists."""
    record = WebhookEvent(
        provider=PaymentProvider.DODO,
        event_id=event.event_id,
        event_type=(event.type or "unknown")[:100],
        payload=raw_payload,
    )
    try:
        with db.begin_nested():
            db.add(record)
            db.flush()
    except IntegrityError:
        return None
    return record


def _find_bill_for_payment_event(db: Session, event: DodoEvent) -> Bill | None:
    bill: Bill | None = None
    if event.bill_id is not None:
        bill = _lock_bill(db, Bill.id == event.bill_id)
    if bill is None and event.checkout_session_id:
        bill = _lock_bill(db, Bill.dodo_checkout_id == event.checkout_session_id)
    if bill is not None and event.user_id is not None and event.user_id != bill.user_id:
        logger.error(
            "Dodo event %s metadata user_id=%s does not own bill_id=%s; not applied",
            event.event_id,
            event.user_id,
            bill.id,
        )
        return None
    return bill


def _resolve_amount(event: DodoEvent, bill: Bill) -> tuple[Decimal, str] | None:
    """Amount + currency to record for a payment event, in the bill's currency if possible.

    If Dodo charged the customer in another currency (adaptive pricing), the amount we
    asked for (``expected_amount`` in checkout metadata) is used instead. If that is not
    available the payment is recorded as received and flagged in the logs.
    """
    if event.amount is None or event.currency is None:
        return None
    if event.currency == bill.currency.upper():
        return event.amount, bill.currency
    if (
        event.expected_amount is not None
        and event.expected_currency == bill.currency.upper()
        and event.expected_amount > 0
    ):
        logger.warning(
            "Dodo payment %s charged in %s for bill_id=%s (%s); recording the requested %s %s",
            event.payment_id,
            event.currency,
            bill.id,
            bill.currency,
            event.expected_amount,
            bill.currency,
        )
        return event.expected_amount, bill.currency
    logger.error(
        "Dodo payment %s currency %s does not match bill_id=%s currency %s; recorded as "
        "received - manual review needed",
        event.payment_id,
        event.currency,
        bill.id,
        bill.currency,
    )
    return event.amount, event.currency


def _apply_payment_succeeded(
    db: Session, event: DodoEvent
) -> tuple[WebhookResult, Payment | None, Bill | None]:
    if not event.payment_id:
        logger.warning("Dodo event %s has no payment_id; ignored", event.event_id)
        return "ignored", None, None
    bill = _find_bill_for_payment_event(db, event)
    if bill is None:
        logger.warning(
            "Dodo event %s (payment %s) matches no bill (bill_id=%s, checkout=%s)",
            event.event_id,
            event.payment_id,
            event.bill_id,
            event.checkout_session_id,
        )
        return "unmatched", None, None
    resolved = _resolve_amount(event, bill)
    if resolved is None or resolved[0] <= 0:
        logger.error("Dodo event %s has no usable amount; ignored", event.event_id)
        return "ignored", None, bill
    amount, currency = resolved

    existing = db.scalar(select(Payment).where(Payment.provider_payment_id == event.payment_id))
    if existing is not None and existing.status != PaymentStatus.FAILED:
        logger.info("Dodo payment %s already recorded; skipped", event.payment_id)
        return "processed", None, bill
    if bill.status == BillStatus.CANCELLED:
        logger.warning(
            "Dodo payment %s received for cancelled bill_id=%s; recorded for audit",
            event.payment_id,
            bill.id,
        )

    if existing is not None:  # a previously failed attempt that later succeeded
        payment = existing
        payment.status = PaymentStatus.SUCCEEDED
        payment.amount = amount
        payment.currency = currency
        payment.paid_at = datetime.now(UTC)
    else:
        payment = Payment(
            user_id=bill.user_id,
            bill_id=bill.id,
            amount=amount,
            currency=currency,
            method=PaymentMethod.ONLINE,
            provider=PaymentProvider.DODO,
            provider_payment_id=event.payment_id,
            status=PaymentStatus.SUCCEEDED,
            paid_at=datetime.now(UTC),
        )
        db.add(payment)
    _refresh_status(db, bill)
    logger.info(
        "Dodo payment %s applied to bill_id=%s (status now %s)",
        event.payment_id,
        bill.id,
        bill.status.value,
    )
    return "processed", payment, bill


def _apply_payment_failed(db: Session, event: DodoEvent) -> WebhookResult:
    """Record a failed attempt for audit (never affects totals)."""
    logger.info("Dodo payment %s failed/cancelled (%s)", event.payment_id, event.type)
    if not event.payment_id:
        return "ignored"
    bill = _find_bill_for_payment_event(db, event)
    if bill is None:
        return "unmatched"
    existing = db.scalar(select(Payment.id).where(Payment.provider_payment_id == event.payment_id))
    resolved = _resolve_amount(event, bill)
    if existing is None and resolved is not None and resolved[0] > 0:
        db.add(
            Payment(
                user_id=bill.user_id,
                bill_id=bill.id,
                amount=resolved[0],
                currency=resolved[1],
                method=PaymentMethod.ONLINE,
                provider=PaymentProvider.DODO,
                provider_payment_id=event.payment_id,
                status=PaymentStatus.FAILED,
                paid_at=datetime.now(UTC),
            )
        )
        db.flush()
    return "processed"


def _apply_refund(db: Session, event: DodoEvent) -> WebhookResult:
    """Apply a succeeded refund to the matching Dodo payment and recompute the bill.

    A full refund marks the payment ``refunded``. A partial refund reduces the payment's
    amount (the refund is noted on the payment) so ``amount_paid`` stays correct.
    """
    if not event.payment_id:
        return "ignored"
    payment = db.scalar(
        select(Payment).where(
            Payment.provider_payment_id == event.payment_id,
            Payment.provider == PaymentProvider.DODO,
        )
    )
    if payment is None:
        logger.warning("Dodo refund %s matches no payment %s", event.refund_id, event.payment_id)
        return "unmatched"
    bill = _lock_bill(db, Bill.id == payment.bill_id)
    if bill is None:  # pragma: no cover - FK guarantees the bill exists
        return "unmatched"
    db.refresh(payment)
    if payment.status != PaymentStatus.SUCCEEDED:
        logger.info(
            "Dodo refund %s: payment %s is %s; skipped",
            event.refund_id,
            payment.id,
            payment.status.value,
        )
        return "processed"
    marker = f"Refund {event.refund_id}" if event.refund_id else None
    if marker and payment.notes and marker in payment.notes:
        return "processed"

    refund_amount: Decimal | None = None
    if event.amount_minor is not None:
        refund_amount = dodo_service.from_minor_units(
            event.amount_minor, event.currency or payment.currency
        )
    full = (
        not event.is_partial
        or refund_amount is None
        or (event.currency in (None, payment.currency.upper()) and refund_amount >= payment.amount)
    )
    if full:
        payment.status = PaymentStatus.REFUNDED
        note = f"{marker or 'Refund'}: full refund"
    elif event.currency not in (None, payment.currency.upper()):
        logger.error(
            "Dodo partial refund %s in %s for payment %s in %s; not applied - manual review",
            event.refund_id,
            event.currency,
            payment.id,
            payment.currency,
        )
        return "ignored"
    else:
        assert refund_amount is not None  # noqa: S101 - narrowed by `full` above
        payment.amount = quantize(Decimal(payment.amount) - refund_amount)
        note = f"{marker or 'Refund'}: partial refund of {refund_amount} {payment.currency}"
    payment.notes = (f"{payment.notes}\n{note}" if payment.notes else note)[:_NOTES_MAX]
    _refresh_status(db, bill)
    logger.info("Dodo refund %s applied to payment %s", event.refund_id, payment.id)
    return "processed"


def handle_dodo_event(db: Session, event: DodoEvent, raw_payload: dict[str, Any]) -> WebhookResult:
    """Process one verified Dodo webhook exactly once and commit.

    Returns ``duplicate`` for a replayed ``event_id``; ``unmatched`` when no bill/payment
    matches (the event is stored with ``processed_at = NULL`` for investigation);
    ``ignored`` for event types we do not act on; otherwise ``processed``.
    Unexpected errors propagate (the transaction is rolled back and Dodo retries).
    """
    record = _store_event(db, event, raw_payload)
    if record is None:
        logger.info("Duplicate Dodo webhook %s ignored", event.event_id)
        return "duplicate"

    receipt: tuple[Bill, Payment] | None = None
    result: WebhookResult
    if event.type == dodo_service.EVENT_PAYMENT_SUCCEEDED:
        result, payment, bill = _apply_payment_succeeded(db, event)
        if payment is not None and bill is not None:
            receipt = (bill, payment)
    elif event.type in (dodo_service.EVENT_PAYMENT_FAILED, dodo_service.EVENT_PAYMENT_CANCELLED):
        result = _apply_payment_failed(db, event)
    elif event.type == dodo_service.EVENT_REFUND_SUCCEEDED:
        result = _apply_refund(db, event)
    else:
        logger.info("Dodo webhook %s of type %r stored and ignored", event.event_id, event.type)
        result = "ignored"

    if result != "unmatched":
        record.processed_at = datetime.now(UTC)
    db.commit()

    if receipt is not None:
        send_receipt(db, *receipt)
    return result
