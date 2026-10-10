"""Schemas for uploaded files."""

from __future__ import annotations

from datetime import datetime

from pydantic import computed_field

from app.enums import FilePurpose
from app.schemas.base import APIModel

UPLOADS_URL_PREFIX = "/api/v1/uploads"


def upload_url(upload_id: int) -> str:
    """Owner-only download URL for an uploaded file."""
    return f"{UPLOADS_URL_PREFIX}/{upload_id}"


class UploadedFileOut(APIModel):
    """Metadata of a stored file (the bytes are served by ``GET /uploads/{id}``)."""

    id: int
    filename: str
    content_type: str
    size_bytes: int
    purpose: FilePurpose
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url(self) -> str:
        """Download URL (requires the owner's bearer token)."""
        return upload_url(self.id)
