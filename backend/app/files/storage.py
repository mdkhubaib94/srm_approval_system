"""Local filesystem storage backend — replaces the source's single shared
GridFS bucket. The on-disk filename is always server-generated (a uuid4),
never the client's original filename, to avoid path traversal and name
collisions; the original filename is preserved only as metadata.
"""

import uuid
from datetime import datetime, timezone
from pathlib import Path

from app.config import get_settings


def _storage_root() -> Path:
    root = Path(get_settings().storage_root)
    root.mkdir(parents=True, exist_ok=True)
    return root


def save_bytes(content: bytes, *, extension: str = ".pdf") -> str:
    """Write `content` to disk under {storage_root}/{yyyy}/{mm}/{uuid4}{ext}
    and return the path relative to storage_root (what gets stored in
    StoredFile.path_on_disk)."""
    now = datetime.now(timezone.utc)
    rel_dir = Path(f"{now:%Y}") / f"{now:%m}"
    (_storage_root() / rel_dir).mkdir(parents=True, exist_ok=True)

    rel_path = rel_dir / f"{uuid.uuid4().hex}{extension}"
    (_storage_root() / rel_path).write_bytes(content)
    return str(rel_path).replace("\\", "/")


def read_bytes(path_on_disk: str) -> bytes:
    return (_storage_root() / path_on_disk).read_bytes()


def delete_file(path_on_disk: str) -> None:
    path = _storage_root() / path_on_disk
    if path.exists():
        path.unlink()
