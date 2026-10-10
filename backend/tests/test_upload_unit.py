"""Pure unit tests (no database) for upload validation and local storage."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.enums import FilePurpose
from app.exceptions import BadRequestError
from app.services.storage_service import LocalStorage, StorageError, build_storage_key
from app.services.upload_service import (
    JPEG,
    LOGO_MAX_BYTES,
    PDF,
    PNG,
    SVG,
    content_disposition,
    sanitize_filename,
    sniff_file_kind,
    svg_is_safe,
    validate_file,
)

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"\x00" * 32
PDF_BYTES = b"%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj\n<<>>\nendobj\n%%EOF"
SAFE_SVG = (
    b'<?xml version="1.0" encoding="UTF-8"?>\n'
    b'<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
    b'viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs>'
    b'<rect width="10" height="10" fill="url(#g)"/><use xlink:href="#g"/></svg>'
)


# --------------------------------------------------------------------------- sniffing


@pytest.mark.parametrize(
    ("data", "expected"),
    [
        (PNG_BYTES, PNG),
        (JPEG_BYTES, JPEG),
        (PDF_BYTES, PDF),
        (SAFE_SVG, SVG),
        (b'<svg xmlns="http://www.w3.org/2000/svg"></svg>', SVG),
        (b"\xef\xbb\xbf  <!-- logo --><svg></svg>", SVG),
        (b"<!DOCTYPE svg><svg/>", SVG),
    ],
)
def test_sniff_detects_supported_types(data: bytes, expected: object) -> None:
    assert sniff_file_kind(data) is expected


@pytest.mark.parametrize(
    "data",
    [
        b"",
        b"GIF89a....",
        b"hello world",
        b"<html><body><svg></svg></body></html>",
        b"MZ\x90\x00 executable",
        b"\xff\xfe<\x00s\x00v\x00g\x00",
    ],
)
def test_sniff_rejects_unknown(data: bytes) -> None:
    assert sniff_file_kind(data) is None


def test_validate_ignores_claimed_type_and_checks_purpose() -> None:
    assert validate_file(PNG_BYTES, FilePurpose.LOGO) is PNG
    assert validate_file(PDF_BYTES, FilePurpose.ATTACHMENT) is PDF
    with pytest.raises(BadRequestError) as exc:
        validate_file(PDF_BYTES, FilePurpose.LOGO)
    assert exc.value.code == "unsupported_file_type"
    with pytest.raises(BadRequestError) as exc:
        validate_file(SAFE_SVG, FilePurpose.ATTACHMENT)
    assert exc.value.code == "unsupported_file_type"
    with pytest.raises(BadRequestError) as exc:
        validate_file(b"", FilePurpose.ATTACHMENT)
    assert exc.value.code == "unsupported_file_type"


def test_validate_rejects_oversize_logo() -> None:
    with pytest.raises(BadRequestError) as exc:
        validate_file(PNG_BYTES + b"\x00" * LOGO_MAX_BYTES, FilePurpose.LOGO)
    assert exc.value.code == "file_too_large"


# --------------------------------------------------------------------------- SVG safety


def test_safe_svg_passes() -> None:
    assert svg_is_safe(SAFE_SVG)
    assert svg_is_safe(b'<svg><image href="data:image/png;base64,AAAA"/></svg>')
    validate_file(SAFE_SVG, FilePurpose.LOGO)


@pytest.mark.parametrize(
    "svg",
    [
        b"<svg><script>alert(1)</script></svg>",
        b"<svg><SCRIPT >alert(1)</SCRIPT></svg>",
        b'<svg onload="alert(1)"></svg>',
        b"<svg><rect ONCLICK = 'x()'/></svg>",
        b'<svg><a href="javascript:alert(1)">x</a></svg>',
        b'<svg><a xlink:href="JavaScript:alert(1)">x</a></svg>',
        b"<svg><foreignObject><div/></foreignObject></svg>",
        b'<svg><image href="https://evil.example/x.png"/></svg>',
        b"<svg><use xlink:href='http://evil.example/s.svg#a'/></svg>",
        b"<svg><use href=//evil.example/a.svg /></svg>",
        b'<svg><image href="data:text/html,<b>"/></svg>',
        b'<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
        b"<svg><style>@import url(https://evil.example/a.css);</style></svg>",
        b'<svg><rect style="fill:url(https://evil.example/t)"/></svg>',
        b'<svg><a href="&#106;avascript:alert(1)">x</a></svg>',
        b"<svg><iframe src='x'/></svg>",
    ],
)
def test_unsafe_svg_rejected(svg: bytes) -> None:
    assert not svg_is_safe(svg)
    if sniff_file_kind(svg) is SVG:
        with pytest.raises(BadRequestError) as exc:
            validate_file(svg, FilePurpose.LOGO)
        assert exc.value.code == "unsafe_svg"


# --------------------------------------------------------------------------- filenames


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("logo.png", "logo.png"),
        ("../../etc/passwd", "passwd"),
        ("C:\\Users\\me\\My Logo.png", "My Logo.png"),
        ("bad\x00na\x1fme\r\n.pdf", "badname.pdf"),
        ("  ", "file.png"),
        (None, "file.png"),
        ("..", "file.png"),
        ("evil\u202egnp.exe", "evilgnp.exe"),
    ],
)
def test_sanitize_filename(raw: str | None, expected: str) -> None:
    assert sanitize_filename(raw, ".png") == expected


def test_sanitize_filename_truncates_keeping_extension() -> None:
    name = sanitize_filename("a" * 400 + ".pdf")
    assert len(name) == 255
    assert name.endswith(".pdf")


def test_content_disposition_is_header_safe() -> None:
    value = content_disposition('in"voice\u00e9;.pdf')
    assert value.startswith('inline; filename="in_voice_.pdf"')
    assert "filename*=UTF-8''in%22voice%C3%A9%3B.pdf" in value
    assert "\n" not in value


# --------------------------------------------------------------------------- storage


def test_build_storage_key_format() -> None:
    key = build_storage_key(42, FilePurpose.LOGO, ".PNG")
    user, purpose, name = key.split("/")
    assert user == "42"
    assert purpose == "logo"
    assert name.endswith(".png")
    assert len(name) == 32 + 4
    assert build_storage_key(42, FilePurpose.LOGO, ".png") != key
    with pytest.raises(StorageError):
        build_storage_key(1, FilePurpose.LOGO, "/../x")


def test_local_storage_roundtrip(tmp_path: Path) -> None:
    storage = LocalStorage(tmp_path / "uploads")
    key = build_storage_key(1, FilePurpose.ATTACHMENT, ".pdf")
    assert not storage.exists(key)
    storage.save(key, PDF_BYTES, "application/pdf")
    assert storage.exists(key)
    assert storage.open(key) == PDF_BYTES
    assert (tmp_path / "uploads" / key).is_file()
    storage.delete(key)
    assert not storage.exists(key)
    storage.delete(key)  # idempotent
    with pytest.raises(FileNotFoundError):
        storage.open(key)


@pytest.mark.parametrize(
    "key",
    [
        "../outside.txt",
        "1/logo/../../../outside.txt",
        "/etc/passwd",
        "\\windows\\win.ini",
        "C:/Windows/win.ini",
        "",
        ".",
        "a\x00b",
    ],
)
def test_local_storage_blocks_traversal(tmp_path: Path, key: str) -> None:
    root = tmp_path / "uploads"
    storage = LocalStorage(root)
    with pytest.raises(StorageError):
        storage.save(key, b"x", "text/plain")
    with pytest.raises(StorageError):
        storage.open(key)
    with pytest.raises(StorageError):
        storage.delete(key)
    assert not (tmp_path / "outside.txt").exists()
