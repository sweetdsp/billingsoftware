"""Application exceptions and their FastAPI handlers.

All error responses use the contract shape ``{"detail": str, "code": str | None}``.
Validation errors keep FastAPI's default 422 shape.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger(__name__)


class AppError(Exception):
    """Base class for expected, client-facing application errors."""

    status_code: int = status.HTTP_500_INTERNAL_SERVER_ERROR
    code: str | None = "internal_error"
    default_detail: str = "Internal server error"

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        self.detail = detail or self.default_detail
        if code is not None:
            self.code = code
        self.headers = headers
        super().__init__(self.detail)


class BadRequestError(AppError):
    """400 - the request is syntactically valid but cannot be processed."""

    status_code = status.HTTP_400_BAD_REQUEST
    code = "bad_request"
    default_detail = "Bad request"


class UnauthorizedError(AppError):
    """401 - missing or invalid credentials."""

    status_code = status.HTTP_401_UNAUTHORIZED
    code = "unauthorized"
    default_detail = "Not authenticated"

    def __init__(
        self,
        detail: str | None = None,
        *,
        code: str | None = None,
        headers: dict[str, str] | None = None,
    ) -> None:
        super().__init__(detail, code=code, headers=headers or {"WWW-Authenticate": "Bearer"})


class ForbiddenError(AppError):
    """403 - authenticated but not allowed."""

    status_code = status.HTTP_403_FORBIDDEN
    code = "forbidden"
    default_detail = "Not enough permissions"


class NotFoundError(AppError):
    """404 - resource does not exist or belongs to another tenant."""

    status_code = status.HTTP_404_NOT_FOUND
    code = "not_found"
    default_detail = "Resource not found"


class ConflictError(AppError):
    """409 - the request conflicts with current state (duplicates, etc.)."""

    status_code = status.HTTP_409_CONFLICT
    code = "conflict"
    default_detail = "Resource conflict"


def _error_body(detail: str, code: str | None) -> dict[str, str | None]:
    return {"detail": detail, "code": code}


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Serialize an :class:`AppError` into the contract error shape."""
    assert isinstance(exc, AppError)  # noqa: S101 - registered only for AppError
    if exc.status_code >= status.HTTP_500_INTERNAL_SERVER_ERROR:
        logger.error("AppError on %s %s: %s", request.method, request.url.path, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(exc.detail, exc.code),
        headers=exc.headers,
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Normalize Starlette/FastAPI ``HTTPException`` into the contract error shape."""
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101 - registered only for it
    detail = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(detail, None),
        headers=getattr(exc, "headers", None),
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Log unexpected errors and return a generic 500 without leaking internals."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=_error_body("Internal server error", "internal_error"),
    )


def register_exception_handlers(app: FastAPI) -> None:
    """Attach all application exception handlers to ``app``."""
    app.add_exception_handler(AppError, app_error_handler)
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
