"""Bills business logic (Module 5): listing, one-off creation, editing and cancelling.

Totals are always computed server-side (:func:`billing_engine.compute_totals`). Only
``draft`` bills can be edited; a bill with any payment cannot be cancelled. Every query is
filtered by ``user_id`` and another user's bill is a 404.
"""

from __future__ import annotations

import logging
from datetime import date, timedelta
from decimal import Decimal

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session, selectinload

from app.enums import BillStatus
from app.exceptions import ConflictError, NotFoundError
from app.models import Bill, BillLineItem, BusinessProfile, Customer, Payment, User
from app.schemas.base import PageParams
from app.schemas.bill import (
    BillCreate,
    BillDetail,
    BillEmailLogOut,
    BillLineItemOut,
    BillListItem,
    BillOut,
    BillPaymentOut,
    BillUpdate,
    PublicBillOut,
    PublicBusiness,
    PublicCustomer,
    PublicLineItem,
)
from app.services import billing_engine
from app.services.pdf_service import balance_due, public_bill_url

logger = logging.getLogger(__name__)


# --------------------------------------------------------------------------- helpers


def get_owned_bill(db: Session, user: User, bill_id: int, *, lock: bool = False) -> Bill:
    """Load one of the user's bills or raise 404 ``bill_not_found``."""
    stmt = select(Bill).where(Bill.id == bill_id, Bill.user_id == user.id)
    if lock:
        stmt = stmt.with_for_update().execution_options(populate_existing=True)
    bill = db.scalar(stmt)
    if bill is None:
        raise NotFoundError("Bill not found", code="bill_not_found")
    return bill


def get_profile(db: Session, user: User) -> BusinessProfile:
    """The user's business profile or 409 ``profile_required``."""
    profile = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == user.id))
    if profile is None:
        raise ConflictError("Set up your business profile first", code="profile_required")
    return profile


def _get_active_customer(db: Session, user: User, customer_id: int) -> Customer:
    customer = db.scalar(
        select(Customer).where(Customer.id == customer_id, Customer.user_id == user.id)
    )
    if customer is None:
        raise NotFoundError("Customer not found", code="customer_not_found")
    if not customer.is_active:
        raise ConflictError("This customer is archived", code="customer_archived")
    return customer


def _list_fields(bill: Bill, customer_name: str, plan_name: str | None) -> dict[str, object]:
    return {
        "id": bill.id,
        "bill_number": bill.bill_number,
        "customer_id": bill.customer_id,
        "customer_name": customer_name,
        "plan_id": bill.plan_id,
        "plan_name": plan_name,
        "issue_date": bill.issue_date,
        "due_date": bill.due_date,
        "period_start": bill.period_start,
        "period_end": bill.period_end,
        "currency": bill.currency,
        "total": bill.total,
        "amount_paid": bill.amount_paid,
        "balance_due": balance_due(bill),
        "status": bill.status,
        "sent_at": bill.sent_at,
        "paid_at": bill.paid_at,
        "created_at": bill.created_at,
    }


def _out_fields(bill: Bill, customer_name: str, plan_name: str | None) -> dict[str, object]:
    return {
        **_list_fields(bill, customer_name, plan_name),
        "subtotal": bill.subtotal,
        "tax_rate": bill.tax_rate,
        "tax_amount": bill.tax_amount,
        "payment_link_url": bill.payment_link_url,
        "public_url": public_bill_url(bill),
        "has_pdf": bill.pdf_file_id is not None,
        "updated_at": bill.updated_at,
    }


def to_out(bill: Bill) -> BillOut:
    """Serialize a bill (no line items)."""
    plan_name = bill.plan.name if bill.plan is not None else None
    return BillOut.model_validate(_out_fields(bill, bill.customer.name, plan_name))


def _replace_lines(bill: Bill, items: list, tax_rate: Decimal) -> None:
    totals = billing_engine.compute_totals(items, tax_rate)
    bill.line_items = [
        BillLineItem(
            description=line.description,
            quantity=line.quantity,
            unit_price=line.unit_price,
            amount=line.amount,
            position=index,
        )
        for index, line in enumerate(totals.lines)
    ]
    bill.subtotal = totals.subtotal
    bill.tax_rate = tax_rate
    bill.tax_amount = totals.tax_amount
    bill.total = totals.total


# --------------------------------------------------------------------------- queries


def list_bills(
    db: Session,
    user: User,
    params: PageParams,
    *,
    status: BillStatus | None = None,
    customer_id: int | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
) -> tuple[list[BillListItem], int]:
    """One page of the user's bills (newest issue date first) and the total count.

    ``date_from`` / ``date_to`` are inclusive and filter on ``issue_date``.
    """
    filters: list[ColumnElement[bool]] = [Bill.user_id == user.id]
    if status is not None:
        filters.append(Bill.status == status)
    if customer_id is not None:
        filters.append(Bill.customer_id == customer_id)
    if date_from is not None:
        filters.append(Bill.issue_date >= date_from)
    if date_to is not None:
        filters.append(Bill.issue_date <= date_to)

    total = db.scalar(select(func.count(Bill.id)).where(*filters))
    rows = db.execute(
        select(Bill, Customer.name)
        .join(Customer, Customer.id == Bill.customer_id)
        .options(selectinload(Bill.plan))
        .where(*filters)
        .order_by(Bill.issue_date.desc(), Bill.id.desc())
        .offset(params.offset)
        .limit(params.limit)
    ).all()
    items = [
        BillListItem.model_validate(
            _list_fields(bill, name, bill.plan.name if bill.plan is not None else None)
        )
        for bill, name in rows
    ]
    return items, int(total or 0)


def get_bill_detail(db: Session, user: User, bill_id: int) -> BillDetail:
    """Bill with line items, payments and email history (newest first)."""
    bill = get_owned_bill(db, user, bill_id)
    plan_name = bill.plan.name if bill.plan is not None else None
    fields = _out_fields(bill, bill.customer.name, plan_name)
    return BillDetail.model_validate(
        {
            **fields,
            "line_items": [BillLineItemOut.model_validate(i) for i in bill.line_items],
            "payments": [
                BillPaymentOut.model_validate(p)
                for p in sorted(bill.payments, key=lambda p: p.paid_at, reverse=True)
            ],
            "email_logs": [
                BillEmailLogOut.model_validate(e)
                for e in sorted(bill.email_logs, key=lambda e: e.created_at, reverse=True)
            ],
        }
    )


# --------------------------------------------------------------------------- commands


def create_bill(db: Session, user: User, data: BillCreate) -> Bill:
    """Create a one-off ``draft`` bill, falling back to the profile defaults.

    Raises:
        ConflictError(profile_required | customer_archived), NotFoundError(customer_not_found).
    """
    profile = get_profile(db, user)
    customer = _get_active_customer(db, user, data.customer_id)
    issue_date = data.issue_date or date.today()
    due_date = data.due_date or issue_date + timedelta(days=profile.default_due_days)
    tax_rate = data.tax_rate if data.tax_rate is not None else profile.default_tax_rate
    bill = Bill(
        user_id=user.id,
        customer_id=customer.id,
        bill_number=billing_engine.allocate_bill_number(db, user.id),
        issue_date=issue_date,
        due_date=due_date,
        currency=data.currency or profile.default_currency,
        status=BillStatus.DRAFT,
    )
    _replace_lines(bill, data.line_items, Decimal(tax_rate))
    db.add(bill)
    db.commit()
    db.refresh(bill)
    logger.info("Created one-off bill id=%s (%s)", bill.id, bill.bill_number)
    return bill


def update_bill(db: Session, user: User, bill_id: int, data: BillUpdate) -> Bill:
    """Edit a draft bill (only fields sent). Totals are recomputed; the stored PDF is dropped.

    Raises:
        ConflictError(bill_not_draft | customer_archived), NotFoundError.
    """
    from app.services import pdf_service

    bill = get_owned_bill(db, user, bill_id, lock=True)
    if bill.status != BillStatus.DRAFT:
        raise ConflictError("Only draft bills can be edited", code="bill_not_draft")
    if data.customer_id is not None and data.customer_id != bill.customer_id:
        bill.customer_id = _get_active_customer(db, user, data.customer_id).id
    if data.issue_date is not None:
        bill.issue_date = data.issue_date
    if data.due_date is not None:
        bill.due_date = data.due_date
    if data.currency is not None:
        bill.currency = data.currency
    if bill.due_date < bill.issue_date:
        raise ConflictError("dueDate must be on or after issueDate", code="invalid_dates")
    tax_rate = Decimal(data.tax_rate) if data.tax_rate is not None else Decimal(bill.tax_rate)
    if data.line_items is not None or data.tax_rate is not None:
        items = data.line_items if data.line_items is not None else list(bill.line_items)
        _replace_lines(bill, items, tax_rate)
    stale_key = pdf_service.detach_pdf(db, bill)
    db.commit()
    pdf_service.delete_blob(stale_key)
    db.refresh(bill)
    return bill


def cancel_bill(db: Session, user: User, bill_id: int) -> Bill:
    """Void a bill. 409 ``bill_has_payments`` if any payment exists, ``bill_cancelled`` if void."""
    bill = get_owned_bill(db, user, bill_id, lock=True)
    if bill.status == BillStatus.CANCELLED:
        raise ConflictError("Bill is already cancelled", code="bill_cancelled")
    has_payment = db.scalar(select(func.count(Payment.id)).where(Payment.bill_id == bill.id))
    if has_payment:
        raise ConflictError("A bill with payments cannot be cancelled", code="bill_has_payments")
    bill.status = BillStatus.CANCELLED
    db.commit()
    db.refresh(bill)
    logger.info("Cancelled bill id=%s", bill.id)
    return bill


# --------------------------------------------------------------------------- public view


def get_public_bill(db: Session, public_token: str) -> PublicBillOut:
    """The customer-facing view of a bill, looked up by its unguessable token.

    Drafts (not yet sent) are hidden. The pay link is only included while payable.
    """
    from app.services.pdf_service import PAYABLE_STATUSES

    bill = db.scalar(select(Bill).where(Bill.public_token == public_token))
    if bill is None or bill.status == BillStatus.DRAFT:
        raise NotFoundError("Bill not found", code="bill_not_found")
    profile = db.scalar(select(BusinessProfile).where(BusinessProfile.user_id == bill.user_id))
    customer = bill.customer
    balance = balance_due(bill)
    payable = bill.status in PAYABLE_STATUSES and balance > 0
    return PublicBillOut(
        bill_number=bill.bill_number,
        issue_date=bill.issue_date,
        due_date=bill.due_date,
        period_start=bill.period_start,
        period_end=bill.period_end,
        currency=bill.currency,
        line_items=[
            PublicLineItem(
                description=i.description,
                quantity=i.quantity,
                unit_price=i.unit_price,
                amount=i.amount,
            )
            for i in bill.line_items
        ],
        subtotal=bill.subtotal,
        tax_rate=bill.tax_rate,
        tax_amount=bill.tax_amount,
        total=bill.total,
        amount_paid=bill.amount_paid,
        balance_due=balance,
        status=bill.status,
        payment_link_url=bill.payment_link_url if payable else None,
        customer=PublicCustomer(name=customer.name, company_name=customer.company_name),
        business=PublicBusiness(
            name=profile.business_name if profile else "",
            address=profile.address if profile else None,
            email=profile.email if profile else None,
            phone=profile.phone if profile else None,
            tax_id=profile.tax_id if profile else None,
            logo_url=None,
        ),
        footer_note=profile.footer_note if profile else None,
    )
