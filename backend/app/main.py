"""FastAPI application entry point (``uvicorn app.main:app``)."""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from apscheduler.schedulers.background import BackgroundScheduler
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import text

from app.config import settings
from app.database import SessionLocal
from app.exceptions import register_exception_handlers
from app.jobs.scheduler import create_scheduler
from app.rate_limit import setup_rate_limiting
from app.routers import api_router


def configure_logging() -> None:
    """Configure root logging once, using ``settings.LOG_LEVEL``."""
    logging.basicConfig(
        level=settings.LOG_LEVEL.upper(),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )


configure_logging()
logger = logging.getLogger("app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Start the APScheduler on startup (if enabled) and shut it down on exit."""
    scheduler: BackgroundScheduler | None = None
    if settings.SCHEDULER_ENABLED:
        scheduler = create_scheduler()
        scheduler.start()
        logger.info("Scheduler started (daily at %02d:00 UTC)", settings.SCHEDULER_CRON_HOUR)
    else:
        logger.info("Scheduler disabled (SCHEDULER_ENABLED=false)")
    app.state.scheduler = scheduler
    try:
        yield
    finally:
        if scheduler is not None and scheduler.running:
            scheduler.shutdown(wait=False)
            logger.info("Scheduler stopped")
        app.state.scheduler = None


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    lifespan=lifespan,
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None if settings.is_production else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

setup_rate_limiting(app)
register_exception_handlers(app)
app.include_router(api_router)


class HealthResponse(BaseModel):
    """Health check payload."""

    status: Literal["ok", "degraded"]
    db: Literal["ok", "error"]
    scheduler: Literal["running", "stopped", "disabled"]


def _check_db() -> Literal["ok", "error"]:
    """Run ``SELECT 1``; report ``"error"`` instead of raising."""
    try:
        with SessionLocal() as session:
            session.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        logger.warning("Health check: database unreachable", exc_info=True)
        return "error"


@app.get("/health", response_model=HealthResponse, tags=["health"])
async def health(request: Request) -> HealthResponse:
    """Liveness/readiness probe: DB ping plus scheduler state."""
    db_status = await run_in_threadpool(_check_db)
    scheduler: BackgroundScheduler | None = getattr(request.app.state, "scheduler", None)
    scheduler_status: Literal["running", "stopped", "disabled"]
    if not settings.SCHEDULER_ENABLED:
        scheduler_status = "disabled"
    elif scheduler is not None and scheduler.running:
        scheduler_status = "running"
    else:
        scheduler_status = "stopped"
    overall: Literal["ok", "degraded"] = "ok" if db_status == "ok" else "degraded"
    return HealthResponse(status=overall, db=db_status, scheduler=scheduler_status)
