"""Dodo Payments integration: per-bill pay links and webhook verification.

Research notes (from the installed SDK ``dodopayments`` 1.120.2 and ``standardwebhooks``)
==========================================================================================

Client / environments
    ``dodopayments.DodoPayments(bearer_token=..., environment="test_mode" | "live_mode")``.
    Base URLs (``dodopayments._client.ENVIRONMENTS``): ``test_mode`` ->
    ``https://test.dodopayments.com``, ``live_mode`` -> ``https://live.dodopayments.com``.
    The client falls back to ``live_mode`` when no environment is given, so we always pass
    ``settings.DODO_PAYMENTS_ENVIRONMENT`` explicitly.

Charging an arbitrary per-bill amount (PRP research item 1)
    Dodo has no "ad-hoc amount" checkout: every checkout is a ``product_cart`` of
    ``{product_id, quantity, amount?}``. The candidates were:

    a. A pre-created "pay what you want" product and ``product_cart[].amount`` override.
       ``amount`` is honoured only for PWYW one-time products, and the *currency comes
       from the product price*, so one product per currency would have to be configured
       by hand in the dashboard. Fragile for a multi-currency app.
    b. ``payments.create(payment_link=True, ...)`` - the same product-cart model, plus it
       needs a full billing address up front.
    c. **One-time product per bill (chosen).** ``client.products.create(name=...,
       price={"type": "one_time_price", "price": <minor units>, "currency": <ISO>,
       "tax_inclusive": True, "discount": 0, "purchasing_power_parity": False},
       tax_category="saas", metadata=...)`` followed by
       ``client.checkout_sessions.create(product_cart=[{"product_id": p.product_id,
       "quantity": 1}], customer={"email", "name"}, metadata=..., return_url=...)``,
       which returns ``CheckoutSessionResponse(session_id, checkout_url)``.
       Works for any supported currency with no dashboard setup, the amount is exact
       and immutable, and ``tax_inclusive=True`` stops Dodo adding tax on top of a bill
       that already contains its own tax. We store ``checkout_url`` as
       ``bill.payment_link_url`` and ``session_id`` as ``bill.dodo_checkout_id``.

    Amounts: every Dodo amount is an ``int`` in the currency's *smallest unit*
    ("cents for USD, yen for JPY, fils for KWD"). :func:`to_minor_units` /
    :func:`from_minor_units` handle 0-, 2- and 3-decimal currencies.

Webhooks (PRP research item 2)
    Standard Webhooks: headers ``webhook-id``, ``webhook-timestamp`` (unix seconds) and
    ``webhook-signature`` (``"v1,<base64 HMAC-SHA256>"``, space separated list) over
    ``f"{id}.{timestamp}.{raw_body}"``. The SDK's ``client.webhooks.unwrap()`` is a thin
    wrapper over ``standardwebhooks.Webhook(key).verify(body, headers)``; we call
    ``standardwebhooks`` directly so verification works without an API key. The library
    strips a ``whsec_`` prefix, base64-decodes the secret, and rejects timestamps more
    than 5 minutes old/new.

    Payload: ``{"business_id", "type", "timestamp", "data": {...}}``. Event types used
    (``dodopayments.types.WebhookEventType``):

    - ``payment.succeeded`` / ``payment.failed`` / ``payment.cancelled`` /
      ``payment.processing`` - ``data`` is a ``Payment``: ``payment_id``,
      ``total_amount`` (int, minor units, incl. tax), ``currency``, ``status``
      (``succeeded`` | ``failed`` | ...), ``metadata`` (the checkout session metadata,
      values are str/float/bool) and ``checkout_session_id``.
    - ``refund.succeeded`` / ``refund.failed`` - ``data`` is a ``Refund``:
      ``refund_id``, ``payment_id`` (the refunded payment), ``amount`` (int minor units,
      optional), ``currency`` (optional), ``is_partial``, ``status``, ``metadata``.

    The webhook's unique id is the ``webhook-id`` header; it is what we store in
    ``WebhookEvent.event_id`` for idempotency.

Public API: :func:`is_configured`, :func:`get_client`, :func:`ensure_payment_link`,
:func:`verify_webhook`, :func:`parse_event`. Nothing here commits; callers own the
transaction.
"""

from __future__ import annotations

import logging
from collections.abc import Mapping
from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation
from functools import lru_cache
from typing import TYPE_CHECKING, Any

from sqlalchemy.orm import Session
from standardwebhooks import Webhook

from app.config import settings
from app.enums import BillStatus
from app.exceptions import UnauthorizedError

if TYPE_CHECKING:
    from dodopayments import DodoPayments

    from app.models import Bill

logger = logging.getLogger(__name__)

# ISO 4217 exponents that differ from the default of 2.
ZERO_DECIMAL_CURRENCIES: frozenset[str] = frozenset(
    {
        "BIF",
        "CLP",
        "DJF",
        "GNF",
        "ISK",
        "JPY",
        "KMF",
        "KRW",
        "PYG",
        "RWF",
        "UGX",
        "VND",
        "VUV",
        "XAF",
        "XOF",
        "XPF",
    }
)
THREE_DECIMAL_CURRENCIES: frozenset[str] = frozenset({"BHD", "IQD", "JOD", "KWD", "LYD", "OMR", "TND"})

EVENT_PAYMENT_SUCCEEDED = "payment.succeeded"
EVENT_PAYMENT_FAILED = "payment.failed"
EVENT_PAYMENT_CANCELLED = "payment.cancelled"
EVENT_REFUND_SUCCEEDED = "refund.succeeded"

NON_PAYABLE_STATUSES: tuple[BillStatus, ...] = (BillStatus.PAID, BillStatus.CANCELLED)
TAX_CATEGORY = "saas"
_TWO_PLACES = Decimal("0.01")


# --------------------------------------------------------------------------- amounts


def currency_exponent(currency: str) -> int:
    """Number of minor-unit digits for an ISO 4217 currency code (0, 2 or 3)."""
    code = currency.upper()
    if code in ZERO_DECIMAL_CURRENCIES:
        return 0
    if code in THREE_DECIMAL_CURRENCIES:
        return 3
    return 2


def to_minor_units(amount: Decimal, currency: str) -> int:
    """Convert a major-unit amount to Dodo's smallest-unit integer (ROUND_HALF_UP).

    ``Decimal("12.34"), "USD" -> 1234``; ``Decimal("1500"), "JPY" -> 1500``.
    """
    exponent = currency_exponent(currency)
    scaled = (Decimal(amount) * (Decimal(10) ** exponent)).quantize(
        Decimal(1), rounding=ROUND_HALF_UP
    )
    return int(scaled)


def from_minor_units(value: int, currency: str) -> Decimal:
    """Convert Dodo's smallest-unit integer back to a 2-dp major-unit Decimal."""
    exponent = currency_exponent(currency)
    major = Decimal(int(value)) / (Decimal(10) ** exponent)
    return major.quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)


# --------------------------------------------------------------------------- client


def is_configured() -> bool:
    """True when a Dodo API key is set (pay links can be created)."""
    return bool(settings.DODO_PAYMENTS_API_KEY.get_secret_value().strip())


@lru_cache(maxsize=1)
def get_client() -> DodoPayments:
    """Return a cached Dodo client for ``DODO_PAYMENTS_ENVIRONMENT`` (tests monkeypatch this)."""
    from dodopayments import DodoPayments

    return DodoPayments(
        bearer_token=settings.DODO_PAYMENTS_API_KEY.get_secret_value(),
        environment=settings.DODO_PAYMENTS_ENVIRONMENT,
        max_retries=2,
        timeout=20.0,
    )


# --------------------------------------------------------------------------- pay links


def _metadata(bill: Bill, balance: Decimal) -> dict[str, str | float | bool]:
    return {
        "bill_id": str(bill.id),
        "user_id": str(bill.user_id),
        "bill_number": bill.bill_number,
        # The amount we asked for, in the bill currency. Lets the webhook handler cope
        # with adaptive pricing (customer charged in another currency).
        "expected_amount": str(balance),
        "expected_currency": bill.currency,
    }


def ensure_payment_link(db: Session, bill: Bill) -> str | None:
    """Return the bill's Dodo pay link, creating it on first use.

    Returns ``None`` (never raises) when Dodo is not configured, the bill is paid or
    cancelled, nothing is due, or the provider call fails. On success stores
    ``payment_link_url`` + ``dodo_checkout_id`` and flushes; the caller commits.
    """
    if bill.payment_link_url:
        return bill.payment_link_url
    if not is_configured():
        return None
    if bill.status in NON_PAYABLE_STATUSES:
        return None
    balance = (Decimal(bill.total) - Decimal(bill.amount_paid)).quantize(_TWO_PLACES)
    if balance <= 0:
        return None

    currency = bill.currency.upper()
    minor = to_minor_units(balance, currency)
    if minor <= 0:
        return None
    metadata = _metadata(bill, balance)
    customer = bill.customer
    try:
        client = get_client()
        product = client.products.create(
            name=f"Bill {bill.bill_number}"[:255],
            description=f"Payment for bill {bill.bill_number}",
            price={
                "type": "one_time_price",
                "price": minor,
                "currency": currency,  # type: ignore[typeddict-item]
                "discount": 0,
                "purchasing_power_parity": False,
                "tax_inclusive": True,
            },
            tax_category=TAX_CATEGORY,
            metadata=metadata,
        )
        session = client.checkout_sessions.create(
            product_cart=[{"product_id": product.product_id, "quantity": 1}],
            customer={"email": customer.email, "name": customer.name},
            metadata=metadata,
            return_url=f"{settings.APP_BASE_URL.rstrip('/')}/pay/{bill.public_token}?status=return",
        )
    except Exception as exc:  # provider/network/validation errors must never propagate
        logger.warning(
            "Dodo pay link creation failed for bill_id=%s: %s", bill.id, type(exc).__name__
        )
        return None

    checkout_url = getattr(session, "checkout_url", None)
    session_id = getattr(session, "session_id", None)
    if not checkout_url or not session_id:
        logger.warning("Dodo checkout session for bill_id=%s returned no URL", bill.id)
        return None
    bill.payment_link_url = str(checkout_url)
    bill.dodo_checkout_id = str(session_id)
    db.flush()
    logger.info("Created Dodo pay link for bill_id=%s (session %s)", bill.id, session_id)
    return bill.payment_link_url


# --------------------------------------------------------------------------- webhooks


def verify_webhook(raw_body: bytes, headers: Mapping[str, str]) -> dict[str, Any]:
    """Verify a Standard Webhooks signature and return the parsed JSON payload.

    Raises:
        UnauthorizedError(code="invalid_signature"): secret unset, headers missing,
            timestamp outside the 5-minute tolerance, bad signature or non-JSON body.
    """
    secret = settings.DODO_PAYMENTS_WEBHOOK_SECRET.get_secret_value().strip()
    if not secret:
        logger.error("Rejected Dodo webhook: DODO_PAYMENTS_WEBHOOK_SECRET is not configured")
        raise UnauthorizedError("Invalid webhook signature", code="invalid_signature")
    wanted = ("webhook-id", "webhook-timestamp", "webhook-signature")
    lowered = {k.lower(): v for k, v in headers.items() if k.lower() in wanted}
    try:
        payload = Webhook(secret).verify(raw_body, lowered)
    except Exception as exc:
        logger.warning("Rejected Dodo webhook: %s", type(exc).__name__)
        raise UnauthorizedError("Invalid webhook signature", code="invalid_signature") from exc
    if not isinstance(payload, dict):
        raise UnauthorizedError("Invalid webhook payload", code="invalid_signature")
    return payload


@dataclass(frozen=True)
class DodoEvent:
    """The parts of a Dodo webhook we act on. ``amount`` is in MAJOR units."""

    event_id: str
    type: str
    payment_id: str | None = None
    bill_id: int | None = None
    user_id: int | None = None
    amount: Decimal | None = None
    amount_minor: int | None = None
    currency: str | None = None
    status: str | None = None
    checkout_session_id: str | None = None
    refund_id: str | None = None
    is_partial: bool = False
    expected_amount: Decimal | None = None
    expected_currency: str | None = None


def _as_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _as_str(value: object) -> str | None:
    return value if isinstance(value, str) and value else None


def _as_decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    try:
        return Decimal(str(value)).quantize(_TWO_PLACES, rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None


def parse_event(payload: Mapping[str, Any], *, event_id: str) -> DodoEvent:
    """Extract a :class:`DodoEvent` from a verified webhook payload.

    ``event_id`` is the ``webhook-id`` header. Missing/odd fields become ``None`` rather
    than raising (the payload is already authenticated).
    """
    event_type = _as_str(payload.get("type")) or ""
    raw_data = payload.get("data")
    data: Mapping[str, Any] = raw_data if isinstance(raw_data, Mapping) else {}
    raw_meta = data.get("metadata")
    metadata: Mapping[str, Any] = raw_meta if isinstance(raw_meta, Mapping) else {}

    currency = _as_str(data.get("currency"))
    currency = currency.upper() if currency else None
    minor = _as_int(data.get("amount" if event_type.startswith("refund.") else "total_amount"))
    amount = from_minor_units(minor, currency) if minor is not None and currency else None
    expected_currency = _as_str(metadata.get("expected_currency"))

    return DodoEvent(
        event_id=event_id,
        type=event_type,
        payment_id=_as_str(data.get("payment_id")),
        bill_id=_as_int(metadata.get("bill_id")),
        user_id=_as_int(metadata.get("user_id")),
        amount=amount,
        amount_minor=minor,
        currency=currency,
        status=_as_str(data.get("status")),
        checkout_session_id=_as_str(data.get("checkout_session_id")),
        refund_id=_as_str(data.get("refund_id")),
        is_partial=data.get("is_partial") is True,
        expected_amount=_as_decimal(metadata.get("expected_amount")),
        expected_currency=expected_currency.upper() if expected_currency else None,
    )
