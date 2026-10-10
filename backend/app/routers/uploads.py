"""File upload endpoints (``/api/v1/uploads``)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.dependencies import get_current_user, get_db
from app.enums import FilePurpose
from app.exceptions import BadRequestError
from app.models import UploadedFile, User
from app.schemas.upload import UploadedFileOut
from app.services import upload_service

router = APIRouter(prefix="/uploads", tags=["uploads"])

SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; sandbox"


@router.post("", response_model=UploadedFileOut, status_code=status.HTTP_201_CREATED)
def upload_file(
    file: Annotated[UploadFile, File(description="The file to upload")],
    purpose: Annotated[FilePurpose, Form(description="logo or attachment")],
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UploadedFile:
    """Upload a logo (PNG/JPEG/SVG, ≤ 2 MB) or attachment (PNG/JPEG/PDF, ≤ MAX_UPLOAD_MB)."""
    if purpose not in upload_service.CLIENT_PURPOSES:
        raise BadRequestError(
            f"Uploads with purpose '{purpose.value}' are not allowed", code="invalid_purpose"
        )
    try:
        data = upload_service.read_limited(file, upload_service.max_bytes_for(purpose))
    finally:
        file.file.close()
    return upload_service.create_upload(db, current_user, data, file.filename, purpose)


@router.get(
    "/{upload_id}",
    response_class=Response,
    responses={200: {"content": {"application/octet-stream": {}}}},
)
def download_file(
    upload_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Return the file bytes (owner only; others get 404)."""
    record = upload_service.get_upload(db, current_user, upload_id)
    data = upload_service.read_upload_bytes(record)
    headers = {
        "Content-Disposition": upload_service.content_disposition(record.filename),
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
    }
    if record.content_type == upload_service.SVG.content_type:
        headers["Content-Security-Policy"] = SVG_CSP
    return Response(content=data, media_type=record.content_type, headers=headers)


@router.delete("/{upload_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_file(
    upload_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    """Delete the file (and unset it as the business logo if it was one)."""
    upload_service.delete_upload(db, current_user, upload_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
