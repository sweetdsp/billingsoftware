"""Payment-provider webhooks: ``/api/v1/webhooks``."""

from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.concurrency import run_in_threadpool

from app.database import SessionLocal
from app.schemas.payment import WebhookAck
from app.services import dodo_service, payment_service

router = APIRouter(prefix="/webhooks", tags=["webhooks"])


def _process(payload: dict, event_id: str) -> WebhookAck:
    event = dodo_service.parse_event(payload, event_id=event_id)
    with SessionLocal() as db:
        result = payment_service.handle_dodo_event(db, event, payload)
    return WebhookAck(status=result)


@router.post("/dodo", response_model=WebhookAck)
async def dodo_webhook(request: Request) -> WebhookAck:
    """Verify the signature (401 if invalid), then process the event exactly once."""
    raw_body = await request.body()
    payload = dodo_service.verify_webhook(raw_body, request.headers)
    event_id = request.headers.get("webhook-id", "")
    return await run_in_threadpool(_process, payload, event_id)
