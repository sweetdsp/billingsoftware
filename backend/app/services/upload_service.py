"""Validate, store, fetch and delete uploaded files.

Security rules:

- The file type is detected from the content (magic bytes); the client-supplied
  ``Content-Type`` and filename extension are never trusted.
- SVG logos are checked against a strict, case-insensitive deny-list (scripts, event
  handlers, ``javascript:`` URLs, ``<foreignObject>``, external references, entities).
- Size limits are enforced while reading (at most ``limit + 1`` bytes are read).
- Every lookup is scoped to the owner; other users' files are reported as 404.

Other modules (e.g. Bills storing generated PDFs) use :func:`create_upload`,
:func:`get_upload` and :func:`read_upload_bytes`.
"""

from __future__ import annotations

import logging
import re
import unicodedata
from dataclasses import dataclass
from urllib.parse import quote

from fastapi import UploadFile
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import settings
from app.enums import FilePurpose
from app.exceptions import BadRequestError, NotFoundError
from app.models import BusinessProfile, UploadedFile, User
from app.services.storage_service import build_storage_key, get_storage

logger = logging.getLogger(__name__)

LOGO_MAX_BYTES = 2 * 1024 * 1024
BILL_PDF_MAX_BYTES = 20 * 1024 * 1024
MAX_FILENAME_LENGTH = 255
_READ_CHUNK = 64 * 1024


@dataclass(frozen=True)
class FileKind:
    """A detected file type."""

    name: str
    content_type: str
    extension: str


PNG = FileKind("png", "image/png", ".png")
JPEG = FileKind("jpeg", "image/jpeg", ".jpg")
PDF = FileKind("pdf", "application/pdf", ".pdf")
SVG = FileKind("svg", "image/svg+xml", ".svg")

ALLOWED_KINDS: dict[FilePurpose, frozenset[str]] = {
    FilePurpose.LOGO: frozenset({"png", "jpeg", "svg"}),
    FilePurpose.ATTACHMENT: frozenset({"png", "jpeg", "pdf"}),
    FilePurpose.BILL_PDF: frozenset({"pdf"}),
}

CLIENT_PURPOSES: frozenset[FilePurpose] = frozenset({FilePurpose.LOGO, FilePurpose.ATTACHMENT})


def max_bytes_for(purpose: FilePurpose) -> int:
    """Maximum accepted size in bytes for ``purpose``."""
    if purpose is FilePurpose.LOGO:
        return LOGO_MAX_BYTES
    if purpose is FilePurpose.BILL_PDF:
        return max(BILL_PDF_MAX_BYTES, settings.max_upload_bytes)
    return settings.max_upload_bytes


# --------------------------------------------------------------------------- sniffing

_SVG_PROLOGUE_RE = re.compile(
    r"^(?:<\?xml[^>]*\?>|<!--.*?-->|<!doctype[^>]*>|\s)*<svg[\s>/]",
    re.IGNORECASE | re.DOTALL,
)


def _decode_text(data: bytes) -> str | None:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        return None
    if "\x00" in text:
        return None
    return text


def sniff_file_kind(data: bytes) -> FileKind | None:
    """Detect PNG / JPEG / PDF / SVG from the content, or return ``None``."""
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return PNG
    if data.startswith(b"\xff\xd8\xff"):
        return JPEG
    if data.startswith(b"%PDF-"):
        return PDF
    text = _decode_text(data)
    if text is not None and _SVG_PROLOGUE_RE.match(text):
        return SVG
    return None


# --------------------------------------------------------------------------- SVG safety

_SVG_DENY_PATTERNS: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p, re.IGNORECASE)
    for p in (
        r"<\s*script",
        r"<\s*foreignObject",
        r"<\s*(?:iframe|embed|object|handler|listener)\b",
        r"<!ENTITY",
        r"[\s\"'/;]on[a-z0-9_-]+\s*=",
        r"(?:java|vb)\s*script\s*:",
        r"data\s*:\s*text/html",
        r"@import",
        r"&#",
    )
)
_SVG_HREF_RE = re.compile(
    r"(?:xlink:)?href\s*=\s*(?:\"([^\"]*)\"|'([^']*)'|([^\s>]*))",
    re.IGNORECASE,
)
_SVG_CSS_URL_RE = re.compile(r"url\(\s*([\"']?)([^)\"']*)\1\s*\)", re.IGNORECASE)


def _is_safe_reference(value: str) -> bool:
    value = value.strip().lower()
    return value.startswith("#") or value.startswith("data:image/")


def svg_is_safe(data: bytes) -> bool:
    """Return ``True`` if the SVG passes the deny-list checks."""
    text = _decode_text(data)
    if text is None:
        return False
    if any(pattern.search(text) for pattern in _SVG_DENY_PATTERNS):
        return False
    for match in _SVG_HREF_RE.finditer(text):
        value = next((g for g in match.groups() if g is not None), "")
        if not _is_safe_reference(value):
            return False
    return all(_is_safe_reference(m.group(2)) for m in _SVG_CSS_URL_RE.finditer(text))


# --------------------------------------------------------------------------- filenames

_CONTROL_OR_SEPARATOR_RE = re.compile(r"[\x00-\x1f\x7f]")


def sanitize_filename(filename: str | None, default_ext: str = "") -> str:
    """Return a safe display filename: basename only, no control chars, ≤ 255 chars."""
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in name if unicodedata.category(ch) not in {"Cc", "Cf", "Zl", "Zp"})
    name = _CONTROL_OR_SEPARATOR_RE.sub("", name).strip().strip(".").strip()
    if not name:
        name = f"file{default_ext}"
    if len(name) > MAX_FILENAME_LENGTH:
        stem, dot, ext = name.rpartition(".")
        if dot and 0 < len(ext) <= 10 and stem:
            name = stem[: MAX_FILENAME_LENGTH - len(ext) - 1] + "." + ext
        else:
            name = name[:MAX_FILENAME_LENGTH]
    return name


def content_disposition(filename: str, disposition: str = "inline") -> str:
    """Build a header-safe ``Content-Disposition`` value (RFC 6266 / 5987)."""
    ascii_name = filename.encode("ascii", "ignore").decode("ascii")
    ascii_name = re.sub(r"[^A-Za-z0-9._ ()-]", "_", ascii_name).strip() or "file"
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(filename, safe='')}"


# --------------------------------------------------------------------------- reading


def read_limited(file: UploadFile, limit: int) -> bytes:
    """Read at most ``limit + 1`` bytes from ``file``; raise 400 if it exceeds ``limit``."""
    chunks: list[bytes] = []
    remaining = limit + 1
    while remaining > 0:
        chunk = file.file.read(min(_READ_CHUNK, remaining))
        if not chunk:
            break
        chunks.append(chunk)
        remaining -= len(chunk)
    data = b"".join(chunks)
    if len(data) > limit:
        raise BadRequestError(
            f"File is too large (maximum {limit // (1024 * 1024)} MB)", code="file_too_large"
        )
    return data


# --------------------------------------------------------------------------- validation


def validate_file(data: bytes, purpose: FilePurpose) -> FileKind:
    """Check size, detected type and (for SVG) safety; return the detected kind."""
    limit = max_bytes_for(purpose)
    if len(data) > limit:
        raise BadRequestError(
            f"File is too large (maximum {limit // (1024 * 1024)} MB)", code="file_too_large"
        )
    if not data:
        raise BadRequestError("File is empty", code="unsupported_file_type")
    kind = sniff_file_kind(data)
    if kind is None or kind.name not in ALLOWED_KINDS[purpose]:
        allowed = ", ".join(sorted(ALLOWED_KINDS[purpose]))
        raise BadRequestError(
            f"Unsupported file type for {purpose.value} (allowed: {allowed})",
            code="unsupported_file_type",
        )
    if kind is SVG and not svg_is_safe(data):
        raise BadRequestError("SVG contains unsafe content", code="unsafe_svg")
    return kind


# --------------------------------------------------------------------------- CRUD


def create_upload(
    db: Session,
    user: User,
    data: bytes,
    filename: str | None,
    purpose: FilePurpose,
    *,
    commit: bool = True,
) -> UploadedFile:
    """Validate ``data``, store it and persist its metadata row.

    With ``commit=False`` the row is only flushed (caller commits); the stored blob
    is removed again if the flush fails.
    """
    kind = validate_file(data, purpose)
    key = build_storage_key(user.id, purpose, kind.extension)
    storage = get_storage()
    storage.save(key, data, kind.content_type)
    record = UploadedFile(
        user_id=user.id,
        filename=sanitize_filename(filename, kind.extension),
        content_type=kind.content_type,
        size_bytes=len(data),
        storage_key=key,
        purpose=purpose,
    )
    try:
        db.add(record)
        if commit:
            db.commit()
            db.refresh(record)
        else:
            db.flush()
    except Exception:
        db.rollback()
        _delete_blob(key)
        raise
    logger.info(
        "Stored upload %s (%s, %d bytes) for user %s", record.id, kind.name, len(data), user.id
    )
    return record


def get_upload(db: Session, user: User, upload_id: int) -> UploadedFile:
    """Return the user's file or raise 404 (also for other users' files)."""
    record = db.scalar(
        select(UploadedFile).where(UploadedFile.id == upload_id, UploadedFile.user_id == user.id)
    )
    if record is None:
        raise NotFoundError("File not found", code="file_not_found")
    return record


def read_upload_bytes(record: UploadedFile) -> bytes:
    """Return the stored bytes of ``record`` (404 if the blob is missing)."""
    try:
        return get_storage().open(record.storage_key)
    except FileNotFoundError as exc:
        logger.error("Blob missing for upload %s (key %s)", record.id, record.storage_key)
        raise NotFoundError("File not found", code="file_not_found") from exc


def delete_upload(db: Session, user: User, upload_id: int) -> None:
    """Delete the user's file row and blob; clears ``business_profile.logo_file_id``."""
    record = get_upload(db, user, upload_id)
    key = record.storage_key
    db.execute(
        update(BusinessProfile)
        .where(BusinessProfile.user_id == user.id, BusinessProfile.logo_file_id == record.id)
        .values(logo_file_id=None)
        .execution_options(synchronize_session="fetch")
    )
    db.delete(record)
    db.commit()
    _delete_blob(key)


def _delete_blob(key: str) -> None:
    try:
        get_storage().delete(key)
    except Exception:
        logger.exception("Failed to delete blob %s from storage", key)
