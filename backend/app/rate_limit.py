"""Rate limiting (slowapi).

Usage in routers::

    from fastapi import Request
    from app.rate_limit import limiter

    @router.post("/auth/login")
    @limiter.limit("5/minute")
    async def login(request: Request, ...) -> ...:  # `request` param is required by slowapi
        ...
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.config import settings

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],
    enabled=settings.ENVIRONMENT != "test",
)


async def rate_limit_exceeded_handler(request: Request, exc: Exception) -> Response:
    """Return a 429 in the contract error shape (plus slowapi's Retry-After headers)."""
    limit_detail = exc.detail if isinstance(exc, RateLimitExceeded) else ""
    response = JSONResponse(
        status_code=429,
        content={"detail": f"Rate limit exceeded: {limit_detail}", "code": "rate_limited"},
    )
    view_rate_limit = getattr(request.state, "view_rate_limit", None)
    if view_rate_limit is not None:
        response = request.app.state.limiter._inject_headers(response, view_rate_limit)
    return response


def setup_rate_limiting(app: FastAPI) -> None:
    """Attach the limiter to ``app.state`` and register the 429 handler."""
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, rate_limit_exceeded_handler)
