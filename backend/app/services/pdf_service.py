"""Bill PDF rendering (Jinja2 HTML → WeasyPrint PDF) and storage.

Public API::

    html = render_bill_html(bill, profile, customer, logo_data_uri)
    pdf = render_bill_pdf(bill, profile, customer, logo_data_uri)
    pdf, stale_key = store_bill_pdf(db, bill, profile)   # render + store + set pdf_file_id

Security:

- The template environment has autoescape on; user-supplied text is never marked safe.
- The logo is embedded as a ``data:`` URI, so rendering needs no network access, and the
  WeasyPrint URL fetcher refuses every non-``data:`` URL (prevents SSRF / local file reads
  through user-controlled HTML or SVG).

WeasyPrint is imported lazily inside :func:`_html_to_pdf` (it needs Pango, which is
available in the Docker image but often not on Windows dev machines). Tests monkeypatch
``_html_to_pdf``.
"""

from __future__ import annotations

import base64
import logging
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any

from jinja2 import Environment, FileSystemLoader, StrictUndefined
from sqlalchemy.orm import Session

from app.config import settings
from app.enums import BillStatus, FilePurpose
from app.exceptions import AppError
from app.models import Bill, BusinessProfile, Customer, UploadedFile
from app.schemas.base import quantize_money
from app.services import upload_service
from app.services.storage_service import get_storage

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates"
BILL_TEMPLATE = "bill.html"

PAYABLE_STATUSES: frozenset[BillStatus] = frozenset(
    {BillStatus.DRAFT, BillStatus.SENT, BillStatus.PARTIALLY_PAID, BillStatus.OVERDUE}
)

STATUS_LABELS: dict[BillStatus, str] = {
    BillStatus.DRAFT: "Draft",
    BillStatus.SENT: "Due",
    BillStatus.PARTIALLY_PAID: "Partially paid",
    BillStatus.PAID: "Paid",
    BillStatus.OVERDUE: "Overdue",
    BillStatus.CANCELLED: "Cancelled",
}


class BlockedURLError(ValueError):
    """Raised when the PDF renderer tries to fetch a non-``data:`` URL."""


class PDFRenderError(AppError):
    """500 - the PDF could not be rendered."""

    status_code = 500
    code = "pdf_render_failed"
    default_detail = "Could not render the bill PDF"


# --------------------------------------------------------------------------- formatting


def format_money(value: Decimal | int | str, currency: str) -> str:
    """Format ``value`` as ``"USD 1,250.00"`` (2 dp, ROUND_HALF_UP, thousands separators)."""
    amount = quantize_money(Decimal(value))
    return f"{currency} {amount:,.2f}"


def format_quantity(value: Decimal) -> str:
    """Quantity without trailing zeros: ``2.00`` → ``"2"``, ``1.50`` → ``"1.5"``."""
    text = f"{quantize_money(Decimal(value)):f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def format_date(value: date | None) -> str:
    """Human date such as ``"17 Oct 2026"`` (empty string for ``None``)."""
    return value.strftime("%d %b %Y") if value is not None else ""


def format_rate(value: Decimal) -> str:
    """Tax rate without trailing zeros: ``18.00`` → ``"18"``."""
    return format_quantity(value)


_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=True,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)
_env.filters["money"] = format_money
_env.filters["qty"] = format_quantity
_env.filters["human_date"] = format_date
_env.filters["rate"] = format_rate


# --------------------------------------------------------------------------- helpers


def public_bill_url(bill: Bill) -> str:
    """The customer-facing bill page ``{APP_BASE_URL}/pay/{public_token}``."""
    return f"{settings.APP_BASE_URL.rstrip('/')}/pay/{bill.public_token}"


def balance_due(bill: Bill) -> Decimal:
    """Outstanding amount (never negative)."""
    return max(Decimal(bill.total) - Decimal(bill.amount_paid), Decimal("0"))


def logo_data_uri(profile: BusinessProfile | None) -> str | None:
    """Return the profile logo as a ``data:`` URI, or ``None`` (no logo / unreadable blob)."""
    if profile is None or profile.logo_file is None:
        return None
    record: UploadedFile = profile.logo_file
    try:
        data = upload_service.read_upload_bytes(record)
    except Exception:
        logger.warning("Logo %s could not be read; rendering without it", record.id)
        return None
    encoded = base64.b64encode(data).decode("ascii")
    return f"data:{record.content_type};base64,{encoded}"


# --------------------------------------------------------------------------- rendering


def render_bill_html(
    bill: Bill,
    profile: BusinessProfile,
    customer: Customer,
    logo_data_uri: str | None,
) -> str:
    """Render the bill as standalone HTML (A4 print layout, autoescaped)."""
    context: dict[str, Any] = {
        "bill": bill,
        "profile": profile,
        "customer": customer,
        "line_items": list(bill.line_items),
        "logo_data_uri": logo_data_uri,
        "currency": bill.currency,
        "balance_due": balance_due(bill),
        "status_label": STATUS_LABELS.get(bill.status, bill.status.value),
        "is_payable": bill.status in PAYABLE_STATUSES and balance_due(bill) > 0,
        "pay_url": bill.payment_link_url or public_bill_url(bill),
        "public_url": public_bill_url(bill),
        "app_name": settings.APP_NAME,
    }
    return _env.get_template(BILL_TEMPLATE).render(context)


def check_fetch_url(url: str) -> None:
    """Allow only ``data:`` URIs; raise :class:`BlockedURLError` for anything else."""
    if not url.strip().lower().startswith("data:"):
        raise BlockedURLError(f"Blocked external resource in bill PDF: {url[:200]}")


def _html_to_pdf(html: str, base_url: str | None) -> bytes:
    """Convert HTML to PDF bytes with WeasyPrint (imported lazily).

    The URL fetcher only serves ``data:`` URIs; every other URL is refused.
    """
    from weasyprint import HTML
    from weasyprint.urls import URLFetcher

    class DataOnlyURLFetcher(URLFetcher):  # type: ignore[misc]
        """WeasyPrint fetcher restricted to ``data:`` URIs (no network, no files)."""

        def fetch(self, url: str, headers: dict[str, str] | None = None) -> Any:
            check_fetch_url(url)
            return super().fetch(url, headers)

    fetcher = DataOnlyURLFetcher(allowed_protocols={"data"}, allow_redirects=False, timeout=5)
    pdf = HTML(string=html, base_url=base_url, url_fetcher=fetcher).write_pdf()
    if not pdf:
        raise PDFRenderError()
    return bytes(pdf)


def render_bill_pdf(
    bill: Bill,
    profile: BusinessProfile,
    customer: Customer,
    logo_data_uri: str | None,
) -> bytes:
    """Render the bill to PDF bytes.

    Raises:
        PDFRenderError: WeasyPrint is unavailable or rendering failed.
    """
    html = render_bill_html(bill, profile, customer, logo_data_uri)
    try:
        return _html_to_pdf(html, None)
    except PDFRenderError:
        raise
    except Exception as exc:
        logger.exception("PDF rendering failed for bill %s", bill.id)
        raise PDFRenderError() from exc


def detach_pdf(db: Session, bill: Bill) -> str | None:
    """Unlink and delete the bill's stored PDF row; return its storage key (blob still exists).

    The caller deletes the blob (:func:`delete_blob`) after committing.
    """
    record = bill.pdf_file
    if record is None:
        bill.pdf_file_id = None
        return None
    key = record.storage_key
    bill.pdf_file = None
    db.delete(record)
    return key


def delete_blob(key: str | None) -> None:
    """Best-effort removal of a stored blob (logged on failure)."""
    if not key:
        return
    try:
        get_storage().delete(key)
    except Exception:
        logger.exception("Failed to delete stale PDF blob %s", key)


def store_bill_pdf(
    db: Session, bill: Bill, profile: BusinessProfile
) -> tuple[bytes, str | None]:
    """Render the bill PDF, store it (replacing any previous one) and set ``pdf_file_id``.

    Only flushes; the caller commits and then calls :func:`delete_blob` on the returned
    stale key.

    Returns:
        ``(pdf_bytes, stale_storage_key_or_None)``
    """
    pdf = render_bill_pdf(bill, profile, bill.customer, logo_data_uri(profile))
    stale_key = detach_pdf(db, bill)
    record = upload_service.create_upload(
        db, bill.user, pdf, f"{bill.bill_number}.pdf", FilePurpose.BILL_PDF, commit=False
    )
    bill.pdf_file = record
    db.flush()
    return pdf, stale_key
