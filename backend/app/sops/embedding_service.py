"""Local embedding service — 100% free, runs inside this process. Direct
port of src/services/embeddingService.js.

Uses `fastembed` (ONNX Runtime under the hood, no torch) with
BAAI/bge-small-en-v1.5 (384-dim vectors) — the same model family and
dimensionality as the source's `Xenova/bge-small-en-v1.5` (transformers.js'
ONNX export of the same base model), chosen over `sentence-transformers`
specifically to avoid a multi-hundred-MB torch dependency for what is, in
production, a CPU-only feature-extraction pipeline.

fastembed's TextEmbedding class already implements the asymmetric
query-vs-document embedding split BGE models require internally (its
`query_embed`/`passage_embed` methods apply the model's own instruction
prefixes) — this preserves the source's `generate_embedding` (document side)
vs `generate_query_embedding` (query side, "Represent this sentence for
searching relevant passages: " prefix) distinction without us having to
hand-apply the prefix ourselves.

The model weights (~35–130MB depending on quantization) are downloaded from
the Hugging Face hub on first use and cached on disk (~/.cache/fastembed by
default, or FASTEMBED_CACHE_PATH). Subsequent calls are fully offline.
"""

import re
from functools import lru_cache

from app.config import get_settings

EMBEDDING_DIM = 384


@lru_cache
def _get_model():
    from fastembed import TextEmbedding

    return TextEmbedding(model_name=get_settings().embedding_model)


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def generate_embedding(text: str) -> list[float]:
    """Document-side embedding (SOP descriptions and chunks)."""
    cleaned = _clean(text)
    if not cleaned:
        raise ValueError("Cannot generate embedding for empty text")
    model = _get_model()
    (vector,) = model.passage_embed([cleaned])
    return vector.tolist()


def generate_query_embedding(text: str) -> list[float]:
    """Query-side embedding (a draft request being matched against SOPs).
    Applies BGE's retrieval instruction prefix internally via fastembed's
    query_embed()."""
    cleaned = _clean(text)
    if not cleaned:
        raise ValueError("Cannot generate embedding for empty text")
    model = _get_model()
    (vector,) = model.query_embed([cleaned])
    return vector.tolist()


def warm_up_embeddings() -> None:
    """Call once at app startup so the first real search isn't slow."""
    try:
        generate_embedding("warm up")
    except Exception:  # pragma: no cover - best-effort warm-up only
        pass
