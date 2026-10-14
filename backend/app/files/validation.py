"""PDF upload validation. Port of the checks in src/controllers/uploadController.js.

Declared MIME types are trivially spoofed by the client, so both the
declared content type AND the actual leading bytes are checked.
"""

ALLOWED_MIME = "application/pdf"
PDF_MAGIC = b"%PDF-"
MAX_FILES_PER_REQUEST = 20


class InvalidUploadError(ValueError):
    pass


class StagedFileRef:
    """A document the client already uploaded on its own via POST
    /uploads/stage (one small request per file, so no single request body is
    big enough to hit a proxy's size limit). It travels in the same `files`
    list as inline uploads, so every endpoint that takes attachments accepts
    staged documents with no change of its own."""

    def __init__(self, file_id: int):
        self.file_id = file_id


def assert_pdf(filename: str, content_type: str | None, content: bytes) -> None:
    if content_type != ALLOWED_MIME:
        raise InvalidUploadError("Only PDF documents are allowed.")
    if content[:5] != PDF_MAGIC:
        raise InvalidUploadError(f'"{filename or "file"}" is not a valid PDF.')
