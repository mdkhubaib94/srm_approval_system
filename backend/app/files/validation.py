"""PDF upload validation. Port of the checks in src/controllers/uploadController.js.

Declared MIME types are trivially spoofed by the client, so both the
declared content type AND the actual leading bytes are checked.
"""

ALLOWED_MIME = "application/pdf"
PDF_MAGIC = b"%PDF-"
MAX_FILES_PER_REQUEST = 20


class InvalidUploadError(ValueError):
    pass


def assert_pdf(filename: str, content_type: str | None, content: bytes) -> None:
    if content_type != ALLOWED_MIME:
        raise InvalidUploadError("Only PDF documents are allowed.")
    if content[:5] != PDF_MAGIC:
        raise InvalidUploadError(f'"{filename or "file"}" is not a valid PDF.')
