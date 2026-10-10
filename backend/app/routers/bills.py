"""Bills API (Module 5) plus manual payments: ``/api/v1/bills``."""

from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.enums import BillStatus
from app.models import User
from app.schemas.base import Page, PageParams
from app.schemas.bill import BillCreate, BillDetail, BillListItem, BillOut, BillUpdate
from app.schemas.payment import ManualPaymentCreate, PaymentOut
from app.services import bill_sender, bill_service, payment_service, upload_service

router = APIRouter(prefix="/bills", tags=["bills"])

DbSession = Annotated[Session, Depends(get_db)]
CurrentUser = Annotated[User, Depends(get_current_user)]


@router.get("", response_model=Page[BillListItem])
def list_bills(
    db: DbSession,
    user: CurrentUser,
    params: Annotated[PageParams, Depends()],
    status_filter: Annotated[BillStatus | None, Query(alias="status")] = None,
    customer_id: Annotated[int | None, Query(alias="customerId", gt=0)] = None,
    date_from: Annotated[date | None, Query(alias="from")] = None,
    date_to: Annotated[date | None, Query(alias="to")] = None,
) -> Page[BillListItem]:
    """List the user's bills, newest first, filtered by status / customer / issue date."""
    items, total = bill_service.list_bills(
        db,
        user,
        params,
        status=status_filter,
        customer_id=customer_id,
        date_from=date_from,
        date_to=date_to,
    )
    return Page[BillListItem](
        items=items, total=total, page=params.page, page_size=params.page_size
    )


@router.post("", response_model=BillOut, status_code=status.HTTP_201_CREATED)
def create_bill(payload: BillCreate, db: DbSession, user: CurrentUser) -> BillOut:
    """Create a one-off draft bill."""
    return bill_service.to_out(bill_service.create_bill(db, user, payload))


@router.get("/{bill_id}", response_model=BillDetail)
def get_bill(bill_id: int, db: DbSession, user: CurrentUser) -> BillDetail:
    """Bill detail with line items, payments and email history."""
    return bill_service.get_bill_detail(db, user, bill_id)


@router.put("/{bill_id}", response_model=BillOut)
def update_bill(
    bill_id: int, payload: BillUpdate, db: DbSession, user: CurrentUser
) -> BillOut:
    """Edit a draft bill (409 ``bill_not_draft`` otherwise)."""
    return bill_service.to_out(bill_service.update_bill(db, user, bill_id, payload))


@router.post("/{bill_id}/send", response_model=BillOut)
def send_bill(bill_id: int, db: DbSession, user: CurrentUser) -> BillOut:
    """Send (or re-send) the bill to the customer. Email failures are logged, not raised."""
    bill = bill_service.get_owned_bill(db, user, bill_id, lock=True)
    bill_sender.send_bill(db, bill)
    db.refresh(bill)
    return bill_service.to_out(bill)


@router.post("/{bill_id}/remind", response_model=BillOut)
def remind_bill(bill_id: int, db: DbSession, user: CurrentUser) -> BillOut:
    """Send a payment reminder now (sent / partially paid / overdue bills)."""
    bill = bill_service.get_owned_bill(db, user, bill_id)
    bill_sender.send_reminder(db, bill)
    db.refresh(bill)
    return bill_service.to_out(bill)


@router.post("/{bill_id}/cancel", response_model=BillOut)
def cancel_bill(bill_id: int, db: DbSession, user: CurrentUser) -> BillOut:
    """Void a bill (409 if it has payments)."""
    return bill_service.to_out(bill_service.cancel_bill(db, user, bill_id))


@router.get("/{bill_id}/pdf", response_class=Response)
def download_pdf(bill_id: int, db: DbSession, user: CurrentUser) -> Response:
    """Download the bill PDF, rendering and storing it on demand if missing."""
    from app.services import pdf_service

    bill = bill_service.get_owned_bill(db, user, bill_id)
    if bill.pdf_file is not None:
        data = upload_service.read_upload_bytes(bill.pdf_file)
    else:
        profile = bill_service.get_profile(db, user)
        data, _ = pdf_service.store_bill_pdf(db, bill, profile)
        db.commit()
    return Response(
        content=data,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="{bill.bill_number}.pdf"'},
    )


@router.post(
    "/{bill_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED
)
def record_payment(
    bill_id: int, payload: ManualPaymentCreate, db: DbSession, user: CurrentUser
) -> PaymentOut:
    """Record a manual payment (cash / bank transfer / cheque / other). Overpayment -> 400."""
    return payment_service.record_manual_payment(db, user, bill_id, payload)
