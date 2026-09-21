"""PDF text extraction + cleaning + chunking for SOP document indexing.
Direct port of src/services/pdfTextService.js.

Handles two kinds of PDFs, 100% locally:
 - Text PDFs   -> PyMuPDF reads the embedded text layer (fast)
 - Scanned PDFs -> pages are rendered to images (PyMuPDF) and run through
                   pytesseract OCR (slow — always call from a background
                   job, never inside a request handler; see index_service.py)

pytesseract shells out to a system-installed `tesseract` binary (unlike the
source's tesseract.js, which bundles its own WASM build) — the deployment
image must install it (`apt-get install tesseract-ocr` on Debian/Ubuntu).
"""

import io
import os
import re
from collections.abc import Callable

import pymupdf

# Pages averaging fewer than this many characters are considered image-only.
SCANNED_PAGE_CHAR_THRESHOLD = int(os.environ.get("SOP_SCANNED_CHAR_THRESHOLD", "50"))
# Render scale for OCR (scale 1 ~= 72 DPI; 3 ~= 216 DPI).
OCR_RENDER_SCALE = float(os.environ.get("SOP_OCR_SCALE", "3"))
# Chunking targets (characters).
CHUNK_TARGET = int(os.environ.get("SOP_CHUNK_TARGET", "1000"))
CHUNK_MAX = int(os.environ.get("SOP_CHUNK_MAX", "1400"))
CHUNK_OVERLAP = int(os.environ.get("SOP_CHUNK_OVERLAP", "200"))


def extract_text_layer(pdf_bytes: bytes) -> list[str]:
    """Extract the text layer of a PDF, page by page."""
    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    try:
        return [page.get_text("text") for page in doc]
    finally:
        doc.close()


def ocr_pdf(pdf_bytes: bytes, on_progress: Callable[[int], None] = lambda page: None) -> list[str]:
    """OCR every page of a (scanned) PDF. Renders pages to PNG with PyMuPDF,
    then recognizes with pytesseract. Sequential on purpose — bounded
    memory, one page at a time."""
    import pytesseract
    from PIL import Image

    doc = pymupdf.open(stream=pdf_bytes, filetype="pdf")
    pages: list[str] = []
    try:
        matrix = pymupdf.Matrix(OCR_RENDER_SCALE, OCR_RENDER_SCALE)
        for i, page in enumerate(doc):
            on_progress(i + 1)
            pixmap = page.get_pixmap(matrix=matrix, colorspace=pymupdf.csRGB, alpha=False)
            image = Image.open(io.BytesIO(pixmap.tobytes("png")))
            pages.append(pytesseract.image_to_string(image, lang="eng"))
        return pages
    finally:
        doc.close()


def extract_pdf_pages(pdf_bytes: bytes, on_progress: Callable[[int], None] = lambda page: None) -> tuple[list[str], str]:
    """Decide text vs scanned and return per-page text.
    Returns (pages, extraction_method) where extraction_method is
    "text" or "ocr"."""
    text_pages: list[str] = []
    try:
        text_pages = extract_text_layer(pdf_bytes)
    except Exception:
        text_pages = []

    total_chars = sum(len(re.sub(r"\s+", "", p)) for p in text_pages)
    avg_chars_per_page = total_chars / len(text_pages) if text_pages else 0

    if text_pages and avg_chars_per_page >= SCANNED_PAGE_CHAR_THRESHOLD:
        return text_pages, "text"

    # Image-only (or unreadable) PDF -> OCR.
    return ocr_pdf(pdf_bytes, on_progress), "ocr"


# ─── Boilerplate cleaning ─────────────────────────────────────────────────────
# Institutional memos are full of letterheads, ref lines, salutations and
# signature blocks. That text is near-identical across ALL SOPs, so embedding
# it would blur the ranking. These heuristics are deliberately conservative.

BOILERPLATE_LINE_PATTERNS = [
    re.compile(r"^(ref|reference)\s*(no|number|#)?\s*[.:—-]", re.IGNORECASE),
    re.compile(r"^(no|circular no|memo no|office order)\s*[.:—-]", re.IGNORECASE),
    re.compile(r"^date[d]?\s*[.:—-]", re.IGNORECASE),
    re.compile(r"^(to|from|through)\s*[,:]?\s*$", re.IGNORECASE),
    re.compile(r"^(dear|respected)\s", re.IGNORECASE),
    re.compile(r"^sir\s*/?\s*madam", re.IGNORECASE),
    re.compile(r"^(yours\s+(faithfully|sincerely|truly)|sincerely|regards|thanking\s+you)", re.IGNORECASE),
    re.compile(r"^\(?\s*(sd/?-|signed)\s*\)?$", re.IGNORECASE),
    re.compile(r"^(cc|copy\s+(to|forwarded))\s*[.:—-]?", re.IGNORECASE),
    re.compile(r"^encl(osure)?s?\s*[.:—-]?", re.IGNORECASE),
    re.compile(r"^page\s*\d+(\s*of\s*\d+)?$", re.IGNORECASE),
    re.compile(r"^\d{1,3}$"),
    re.compile(r"^[-_=*·.\s]+$"),
]

_SUB_LABEL_RE = re.compile(r"^sub(ject)?\s*[.:—-]\s*", re.IGNORECASE)
_LETTERS_RE = re.compile(r"[a-zA-Z]")


def clean_page_text(raw_text: str) -> str:
    lines = (raw_text or "").splitlines()
    kept: list[str] = []

    for line in lines:
        trimmed = line.strip()
        if not trimmed:
            kept.append("")
            continue
        # "Sub:/Subject:" lines carry real content — strip only the label.
        trimmed = _SUB_LABEL_RE.sub("", trimmed)
        if not trimmed:
            continue
        if any(pattern.search(trimmed) for pattern in BOILERPLATE_LINE_PATTERNS):
            continue
        # Drop lines that are mostly non-letters (tables of dashes, phone/fax rows).
        letters = len(_LETTERS_RE.findall(trimmed))
        if len(trimmed) >= 8 and letters / len(trimmed) < 0.3:
            continue
        kept.append(trimmed)

    joined = "\n".join(kept)
    joined = re.sub(r"\n{3,}", "\n\n", joined)
    joined = re.sub(r"[ \t]{2,}", " ", joined)
    return joined.strip()


# ─── Chunking ─────────────────────────────────────────────────────────────────

_SENTENCE_SPLIT_RE = re.compile(r"(?<=[.!?])\s+")


def chunk_page_text(text: str, page: int) -> list[dict]:
    """Split one page's cleaned text into overlapping chunks.
    Paragraph-aware: prefers to break on blank lines, then sentences."""
    if not text:
        return []
    if len(text) <= CHUNK_MAX:
        return [{"text": text, "page": page}] if len(text) >= 40 else []

    units: list[str] = []
    for paragraph in re.split(r"\n\n+", text):
        if len(paragraph) > CHUNK_MAX:
            units.extend(u.strip() for u in _SENTENCE_SPLIT_RE.split(paragraph) if u.strip())
        elif paragraph.strip():
            units.append(paragraph.strip())

    chunks: list[dict] = []
    current = ""
    for unit in units:
        if current and (len(current) + len(unit) + 1) > CHUNK_TARGET:
            chunks.append({"text": current.strip(), "page": page})
            # Overlap: carry the tail of the previous chunk into the next one.
            current = current[-CHUNK_OVERLAP:] + "\n" + unit
        else:
            current = f"{current}\n{unit}" if current else unit

    if len(current.strip()) >= 40:
        chunks.append({"text": current.strip(), "page": page})

    return chunks


def pdf_to_chunks(pdf_bytes: bytes, on_progress: Callable[[int], None] = lambda page: None) -> tuple[list[dict], str]:
    """Full pipeline: PDF bytes -> cleaned, chunked text ready for embedding.
    Returns (chunks, extraction_method)."""
    pages, extraction_method = extract_pdf_pages(pdf_bytes, on_progress)

    chunks: list[dict] = []
    for idx, raw_page in enumerate(pages):
        cleaned = clean_page_text(raw_page)
        chunks.extend(chunk_page_text(cleaned, idx + 1))

    return chunks, extraction_method
