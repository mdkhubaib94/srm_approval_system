import pymupdf


def make_text_pdf(paragraphs: list[str]) -> bytes:
    """A real, valid PDF with an actual extractable text layer — one
    paragraph per page, used so the text-layer extraction path (not OCR) is
    exercised in tests without needing a system tesseract binary installed."""
    doc = pymupdf.open()
    for paragraph in paragraphs:
        page = doc.new_page()
        y = 72
        for line in paragraph.split("\n"):
            page.insert_text((72, y), line)
            y += 20
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


def sop_pdf_upload(paragraphs: list[str], filename: str = "sop.pdf"):
    return ("attachments", (filename, make_text_pdf(paragraphs), "application/pdf"))
