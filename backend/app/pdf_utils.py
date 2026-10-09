import os
import re
import unicodedata
from pathlib import Path
from urllib.parse import quote

PDF_DIR = "./uploads/problems"
os.makedirs(PDF_DIR, exist_ok=True)

def sanitize_filename(filename: str, fallback_prefix: str = "file") -> str:
    """
    Sanitize filename into safe ASCII characters for filesystem and HTTP headers:
    1. Replaces 'đ'/'Đ' with 'd'/'D' and removes Vietnamese diacritics.
    2. Replaces non-alphanumeric chars (except . - _) with underscores.
    """
    if not filename:
        return f"{fallback_prefix}.pdf"
    base = os.path.basename(filename)
    base = base.replace('đ', 'd').replace('Đ', 'D')
    normalized = unicodedata.normalize('NFKD', base).encode('ascii', 'ignore').decode('ascii')
    clean = re.sub(r'[^a-zA-Z0-9._-]', '_', normalized)
    clean = re.sub(r'_+', '_', clean).strip('._')
    if not clean or clean.endswith('.'):
        clean = f"{clean or fallback_prefix}.pdf"
    if not clean.lower().endswith('.pdf'):
        clean = f"{clean}.pdf"
    return clean

def make_content_disposition(disposition: str, filename: str) -> str:
    """
    Creates RFC 6266 / RFC 5987 compliant Content-Disposition header.
    ASCII fallback in filename="..." and UTF-8 encoded in filename*=UTF-8''...
    Ensures Starlette latin-1 header encoding never fails!
    """
    ascii_name = sanitize_filename(filename)
    quoted_utf8 = quote(filename)
    return f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quoted_utf8}"

def resolve_problem_pdf(existing_filename: str | None) -> str | None:
    """Find an explicitly attached PDF without generating or attaching files."""
    if not existing_filename:
        return None
    root = Path(PDF_DIR).resolve()
    for filename in (existing_filename, sanitize_filename(existing_filename)):
        path = root / filename
        if path.resolve().is_relative_to(root) and path.is_file():
            return filename
    return None
