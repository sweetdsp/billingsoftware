"""Delivering a bill: PDF + pay link + email, and overdue reminders.

An email failure never raises and never rolls the bill back: the bill stays as it was and
a failed ``EmailLog`` row records the error (surfaced in the bill's email history).
"""

from __future__ import annotations

import logging
from datetime import UTC, date, datetime

from sqlalchemy.orm import Session

from app.enums import BillStatus, EmailStatus, EmailTemplate
from app.exceptions import ConflictError
from app.models import Bill, EmailLog
from app.services import dodo_service, pdf_service
from app.services.bill_service import get_profile
from app.services.email_service import EmailAttachment, send_email

logger = logging.getLogger(__name__)

SENDABLE_STATUSES = frozenset({BillStatus.DRAFT, BillStatus.SENT})
REMINDABLE_STATUSES = frozenset({BillStatus.SENT, BillStatus.PARTIALLY_PAID, BillStatus.OVERDUE})


def _context(bill: Bill, business_name: str, footer_note: str | None) -> dict[str, object]:
    return {
        "business_name": business_name,
        "customer_name": bill.customer.name,
        "bill_number": bill.bill_number,
        "total": str(bill.total),
        "currency": bill.currency,
        "due_date": bill.due_date.isoformat(),
        "pay_url": bill.payment_link_url or pdf_service.public_bill_url(bill),
        "footer_note": footer_note,
    }


def send_bill(db: Session, bill: Bill) -> EmailLog:
    """Render + store the PDF, ensure the pay link, email the customer and mark ``sent``.

    A PDF render failure is logged and the email goes out without the attachment. If the
    email fails the bill keeps its status. Commits.

    Raises:
        ConflictError(bill_not_sendable): only draft / sent bills can be (re-)sent.
        ConflictError(profile_required): the owner has no business profile.
    """
    if bill.status not in SENDABLE_STATUSES:
        raise ConflictError("Only draft or sent bills can be sent", code="bill_not_sendable")
    profile = get_profile(db, bill.user)

    attachments: list[EmailAttachment] = []
    stale_key: str | None = None
    try:
        pdf, stale_key = pdf_service.store_bill_pdf(db, bill, profile)
        attachments.append(EmailAttachment(filename=f"{bill.bill_number}.pdf", content=pdf))
    except pdf_service.PDFRenderError:
        logger.warning("Sending bill id=%s without PDF (render failed)", bill.id)

    dodo_service.ensure_payment_link(db, bill)
    log = send_email(
        db,
        to=bill.customer.email,
        template=EmailTemplate.BILL_SENT,
        context=_context(bill, profile.business_name, profile.footer_note),
        user_id=bill.user_id,
        bill_id=bill.id,
        attachments=attachments or None,
    )
    if log.status == EmailStatus.SENT:
        if bill.status == BillStatus.DRAFT:
            bill.status = BillStatus.SENT
        bill.sent_at = datetime.now(UTC)
    db.commit()
    pdf_service.delete_blob(stale_key)
    return log


def send_reminder(db: Session, bill: Bill, today: date | None = None) -> EmailLog:
    """Email a payment reminder for an unpaid bill. Commits.

    Raises:
        ConflictError(bill_not_remindable): bill is not sent / partially paid / overdue.
    """
    if bill.status not in REMINDABLE_STATUSES:
        raise ConflictError(
            "Reminders can only be sent for unpaid, sent bills", code="bill_not_remindable"
        )
    profile = get_profile(db, bill.user)
    dodo_service.ensure_payment_link(db, bill)
    context = _context(bill, profile.business_name, profile.footer_note)
    context["days_overdue"] = max(((today or date.today()) - bill.due_date).days, 0)
    log = send_email(
        db,
        to=bill.customer.email,
        template=EmailTemplate.REMINDER,
        context=context,
        user_id=bill.user_id,
        bill_id=bill.id,
    )
    db.commit()
    return log
