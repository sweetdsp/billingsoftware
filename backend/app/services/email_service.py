"""Transactional email (Resend) - the single email module for every feature.

Public API::

    from app.services.email_service import EmailAttachment, send_email

    log = send_email(
        db,
        to="customer@example.com",
        template=EmailTemplate.BILL_SENT,
        context={"business_name": ..., "customer_name": ..., ...},
        user_id=owner.id,
        bill_id=bill.id,
        attachments=[EmailAttachment(filename="BM-0001.pdf", content=pdf_bytes)],
    )

Templates live in ``app/templates/emails/<template>.html``; each extends ``_base.html`` and
defines a ``subject`` block plus a ``content`` block. Rendering uses autoescape and
``StrictUndefined`` (a missing context key is a bug and is reported as a failed send).

``send_email`` never raises for render or delivery problems: it logs, records an
``EmailLog`` with ``status=failed`` and returns it. It only ``flush``es; the caller commits.
``_deliver`` is the only function that talks to Resend (tests monkeypatch it).
"""

from __future__ import annotations

import base64
import html
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import resend
from jinja2 import Environment, FileSystemLoader, StrictUndefined, TemplateError
from sqlalchemy.orm import Session

from app.config import settings
from app.enums import EmailStatus, EmailTemplate
from app.models import EmailLog

logger = logging.getLogger(__name__)

TEMPLATE_DIR = Path(__file__).resolve().parent.parent / "templates" / "emails"
_MAX_ERROR_LENGTH = 1000

_env = Environment(
    loader=FileSystemLoader(str(TEMPLATE_DIR)),
    autoescape=True,
    undefined=StrictUndefined,
    trim_blocks=True,
    lstrip_blocks=True,
)


@dataclass(frozen=True)
class EmailAttachment:
    """A file attached to an outgoing email."""

    filename: str
    content: bytes


@dataclass(frozen=True)
class RenderedEmail:
    """A rendered subject + HTML body."""

    subject: str
    html: str


def render_email(template: EmailTemplate, context: dict[str, Any]) -> RenderedEmail:
    """Render the subject and HTML body for ``template`` with ``context``.

    Raises:
        jinja2.TemplateError: missing template or context key.
    """
    base_context = {"app_name": settings.APP_NAME, "app_base_url": settings.APP_BASE_URL}
    full_context = {**base_context, **context}
    tmpl = _env.get_template(f"{template.value}.html")
    body = tmpl.render(full_context)
    subject_block = tmpl.blocks.get("subject")
    raw_subject = "".join(subject_block(tmpl.new_context(full_context))) if subject_block else ""
    # The subject is plain text: undo HTML escaping and collapse whitespace.
    subject = re.sub(r"\s+", " ", html.unescape(raw_subject)).strip() or settings.APP_NAME
    return RenderedEmail(subject=subject, html=body)


def _deliver(payload: dict[str, Any]) -> str:
    """Send ``payload`` through Resend and return the provider message id.

    This is the only function that performs network I/O for email.

    Raises:
        Exception: anything Resend raises, or a missing API key / message id.
    """
    api_key = settings.RESEND_API_KEY.get_secret_value()
    if not api_key:
        raise RuntimeError("RESEND_API_KEY is not configured")
    resend.api_key = api_key
    response = resend.Emails.send(payload)  # type: ignore[arg-type]
    message_id = response.get("id") if isinstance(response, dict) else None
    if not message_id:
        raise RuntimeError("Resend response did not include a message id")
    return str(message_id)


def _build_payload(
    to: str, rendered: RenderedEmail, attachments: list[EmailAttachment] | None
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "from": settings.RESEND_FROM_EMAIL,
        "to": [to],
        "subject": rendered.subject,
        "html": rendered.html,
    }
    if attachments:
        payload["attachments"] = [
            {"filename": a.filename, "content": base64.b64encode(a.content).decode("ascii")}
            for a in attachments
        ]
    return payload


def send_email(
    db: Session,
    *,
    to: str,
    template: EmailTemplate,
    context: dict[str, Any],
    user_id: int | None = None,
    bill_id: int | None = None,
    attachments: list[EmailAttachment] | None = None,
) -> EmailLog:
    """Render and send a transactional email, recording an :class:`EmailLog`.

    Never raises on render/delivery failure: the returned log has ``status=failed`` and
    ``error`` set. The log is ``db.add``-ed and flushed (the caller commits). If
    ``user_id`` is ``None`` the log cannot be persisted (``email_logs.user_id`` is NOT NULL)
    and a transient ``EmailLog`` is returned instead.
    """
    log = EmailLog(user_id=user_id, bill_id=bill_id, to_email=to, template=template)
    try:
        rendered = render_email(template, context)
        log.resend_message_id = _deliver(_build_payload(to, rendered, attachments))
        log.status = EmailStatus.SENT
        logger.info("Email %s sent (user_id=%s, bill_id=%s)", template.value, user_id, bill_id)
    except TemplateError as exc:
        log.status = EmailStatus.FAILED
        log.error = f"render_error: {type(exc).__name__}: {exc}"[:_MAX_ERROR_LENGTH]
        logger.exception("Email %s failed to render", template.value)
    except Exception as exc:
        log.status = EmailStatus.FAILED
        log.error = f"{type(exc).__name__}: {exc}"[:_MAX_ERROR_LENGTH]
        logger.warning(
            "Email %s delivery failed (user_id=%s, bill_id=%s): %s",
            template.value,
            user_id,
            bill_id,
            type(exc).__name__,
        )

    if user_id is None:
        logger.warning("Email %s sent without user_id; EmailLog not persisted", template.value)
        return log
    db.add(log)
    db.flush()
    return log
