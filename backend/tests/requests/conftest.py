MINIMAL_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF"


def pdf_upload(filename: str = "attachment.pdf"):
    return ("attachments", (filename, MINIMAL_PDF_BYTES, "application/pdf"))
