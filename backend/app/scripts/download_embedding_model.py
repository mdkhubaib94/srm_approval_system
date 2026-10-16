"""Download (or verify) the SOP embedding model into the persistent cache.

Usage (from backend/, as the service user on the server):
  python -m app.scripts.download_embedding_model

Needs internet access to huggingface.co the first time. On a server without
internet, run this on any machine that has it, then copy the resulting
backend/storage/ai-models/ folder to the same place on the server (see deploy/README.md).
"""

import sys

from app.sops.embedding_service import EMBEDDING_DIM, generate_embedding, get_model_cache_dir


def main() -> int:
    cache = get_model_cache_dir()
    print(f"Model cache: {cache}")
    try:
        vec = generate_embedding("SRM PRIME embedding model check")
    except Exception as err:  # noqa: BLE001
        print(f"FAILED: {err}", file=sys.stderr)
        print("If this server has no internet, copy backend/storage/ai-models/ from a machine that ran this script.", file=sys.stderr)
        return 1
    if len(vec) != EMBEDDING_DIM:
        print(f"FAILED: unexpected vector size {len(vec)}", file=sys.stderr)
        return 1
    print(f"OK: model loaded, {EMBEDDING_DIM}-dim embeddings working.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
