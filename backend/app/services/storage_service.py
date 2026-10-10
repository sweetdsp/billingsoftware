"""Pluggable binary storage for uploaded files and generated PDFs.

Two backends implement :class:`StorageBackend`:

- :class:`LocalStorage` - files under ``settings.UPLOAD_DIR`` (development / single host).
- :class:`S3Storage` - any S3-compatible bucket (AWS S3, Cloudflare R2, MinIO...).

Use :func:`get_storage` to obtain the configured, process-wide instance and
:func:`build_storage_key` to generate collision-free keys. Tests swap the backend
with :func:`set_storage` (and restore it with ``set_storage(None)``).
"""

from __future__ import annotations

import logging
import re
import uuid
from pathlib import Path
from typing import Any, Protocol, runtime_checkable

from app.config import settings
from app.enums import FilePurpose

logger = logging.getLogger(__name__)

_EXT_RE = re.compile(r"^\.[a-z0-9]{1,10}$")


class StorageError(Exception):
    """Raised when a storage operation fails or a key is invalid."""


@runtime_checkable
class StorageBackend(Protocol):
    """Minimal key/value blob store used by the upload and PDF services."""

    def save(self, key: str, data: bytes, content_type: str) -> None:
        """Store ``data`` under ``key`` (overwriting any existing object)."""
        ...

    def open(self, key: str) -> bytes:
        """Return the bytes stored under ``key``; raise ``FileNotFoundError`` if missing."""
        ...

    def delete(self, key: str) -> None:
        """Remove ``key``; missing keys are ignored."""
        ...

    def exists(self, key: str) -> bool:
        """True if an object is stored under ``key``."""
        ...


def build_storage_key(user_id: int, purpose: FilePurpose, ext: str = "") -> str:
    """Return a new unique key ``{user_id}/{purpose}/{uuid4hex}{ext}``.

    ``ext`` must be empty or a short lowercase extension such as ``".png"``.
    """
    ext = ext.lower()
    if ext and not _EXT_RE.match(ext):
        raise StorageError(f"Invalid file extension: {ext!r}")
    return f"{int(user_id)}/{purpose.value}/{uuid.uuid4().hex}{ext}"


class LocalStorage:
    """Store blobs as files below a root directory, refusing paths that escape it."""

    def __init__(self, root: str | Path) -> None:
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not key or "\x00" in key or key.startswith(("/", "\\")) or ":" in key:
            raise StorageError("Invalid storage key")
        path = (self.root / key).resolve()
        if path == self.root or not path.is_relative_to(self.root):
            raise StorageError("Storage key escapes the storage root")
        return path

    def save(self, key: str, data: bytes, content_type: str) -> None:
        path = self._path(key)
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_bytes(data)
        tmp.replace(path)

    def open(self, key: str) -> bytes:
        path = self._path(key)
        if not path.is_file():
            raise FileNotFoundError(key)
        return path.read_bytes()

    def delete(self, key: str) -> None:
        path = self._path(key)
        try:
            path.unlink()
        except FileNotFoundError:
            logger.info("Local storage delete: %s already missing", key)

    def exists(self, key: str) -> bool:
        return self._path(key).is_file()


class S3Storage:
    """Store blobs in an S3-compatible bucket via boto3."""

    def __init__(
        self,
        bucket: str,
        *,
        endpoint_url: str | None = None,
        access_key_id: str | None = None,
        secret_access_key: str | None = None,
        client: Any | None = None,
    ) -> None:
        if not bucket:
            raise StorageError("S3_BUCKET is required for S3 storage")
        self.bucket = bucket
        if client is None:
            import boto3

            client = boto3.client(
                "s3",
                endpoint_url=endpoint_url or None,
                aws_access_key_id=access_key_id or None,
                aws_secret_access_key=secret_access_key or None,
            )
        self._client = client

    def save(self, key: str, data: bytes, content_type: str) -> None:
        self._client.put_object(Bucket=self.bucket, Key=key, Body=data, ContentType=content_type)

    def open(self, key: str) -> bytes:
        try:
            response = self._client.get_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if _is_s3_not_found(exc):
                raise FileNotFoundError(key) from exc
            raise
        body: bytes = response["Body"].read()
        return body

    def delete(self, key: str) -> None:
        self._client.delete_object(Bucket=self.bucket, Key=key)

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self.bucket, Key=key)
        except Exception as exc:
            if _is_s3_not_found(exc):
                return False
            raise
        return True


def _is_s3_not_found(exc: Exception) -> bool:
    response = getattr(exc, "response", None)
    if not isinstance(response, dict):
        return False
    code = str(response.get("Error", {}).get("Code", ""))
    return code in {"404", "NoSuchKey", "NotFound"}


_storage: StorageBackend | None = None


def _build_default_storage() -> StorageBackend:
    if settings.STORAGE_BACKEND == "s3":
        return S3Storage(
            settings.S3_BUCKET,
            endpoint_url=settings.S3_ENDPOINT_URL or None,
            access_key_id=settings.S3_ACCESS_KEY_ID or None,
            secret_access_key=settings.S3_SECRET_ACCESS_KEY.get_secret_value() or None,
        )
    return LocalStorage(settings.UPLOAD_DIR)


def get_storage() -> StorageBackend:
    """Return the configured storage backend (created lazily, then cached)."""
    global _storage
    if _storage is None:
        _storage = _build_default_storage()
    return _storage


def set_storage(storage: StorageBackend | None) -> None:
    """Override the cached backend (tests); ``None`` resets to the configured default."""
    global _storage
    _storage = storage
