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

import asyncio
import logging
import os
import re
from functools import lru_cache
from pathlib import Path

from app.config import get_settings

logger = logging.getLogger("app.sops.embedding")

EMBEDDING_DIM = 384

# backend/ directory (this file is backend/app/sops/embedding_service.py)
_BACKEND_DIR = Path(__file__).resolve().parents[2]


def get_model_cache_dir() -> Path:
    """Persistent model cache. fastembed's own default is the system temp
    dir, which systemd's PrivateTmp wipes on every restart — on a server
    without internet access that makes every index job fail."""
    settings = get_settings()
    path = Path(settings.embedding_cache_dir or Path(settings.storage_root) / "ai-models")
    if not path.is_absolute():
        path = _BACKEND_DIR / path
    path.mkdir(parents=True, exist_ok=True)
    return path


@lru_cache
def _get_model():
    cache_dir = get_model_cache_dir()
    # huggingface_hub also writes lock/metadata files under HF_HOME
    # (default ~/.cache), which is read-only under ProtectSystem=strict.
    os.environ.setdefault("HF_HOME", str(cache_dir / "hf"))
    from fastembed import TextEmbedding

    model_name = get_settings().embedding_model
    logger.info("[embedding] Loading %s (cache: %s)", model_name, cache_dir)
    return TextEmbedding(model_name=model_name, cache_dir=str(cache_dir))


# ─── Automatic model setup ────────────────────────────────────────────────────
# Set while the startup bootstrap is still trying to get the model (e.g. the
# first download is in progress, or the server cannot reach Hugging Face yet).
# While set, embedding calls fail fast instead of starting a blocking download
# inside an HTTP request or the indexing queue.
_bootstrapping = False

# Retry delays (seconds) while the model cannot be loaded; the last value
# repeats until it succeeds.
_RETRY_DELAYS = (60, 300, 900)


class EmbeddingModelUnavailable(RuntimeError):
    pass


def is_model_ready() -> bool:
    return _get_model.cache_info().currsize > 0


def is_bootstrapping() -> bool:
    return _bootstrapping and not is_model_ready()


def _model():
    if is_bootstrapping():
        raise EmbeddingModelUnavailable(
            "The AI model is still being set up on the server; it will be used automatically once ready."
        )
    return _get_model()


async def bootstrap_model(on_ready=None) -> None:
    """Started once from the app lifespan. Downloads/loads the model in a
    worker thread (never blocking startup), retries until it works, then
    calls `on_ready` (used to index every SOP that missed out)."""
    global _bootstrapping
    _bootstrapping = True
    attempt = 0
    while True:
        try:
            await asyncio.to_thread(_get_model)
            await asyncio.to_thread(lambda: _get_model().passage_embed(["warm up"]).__next__())
            break
        except Exception as err:  # noqa: BLE001
            delay = _RETRY_DELAYS[min(attempt, len(_RETRY_DELAYS) - 1)]
            attempt += 1
            logger.error(
                "[embedding] Could not load the AI model (attempt %d): %s. Retrying in %d min. "
                "If this server has no internet access, copy the ai-models folder from a "
                "machine that has run `python -m app.scripts.download_embedding_model` into %s.",
                attempt, err, delay // 60, get_model_cache_dir(),
            )
            await asyncio.sleep(delay)
    _bootstrapping = False
    logger.info("[embedding] Model ready")
    if on_ready is not None:
        try:
            await on_ready()
        except Exception:
            logger.exception("[embedding] Post-setup indexing failed")


def _clean(text: str) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def generate_embedding(text: str) -> list[float]:
    """Document-side embedding (SOP descriptions and chunks)."""
    cleaned = _clean(text)
    if not cleaned:
        raise ValueError("Cannot generate embedding for empty text")
    model = _model()
    (vector,) = model.passage_embed([cleaned])
    return vector.tolist()


def generate_query_embedding(text: str) -> list[float]:
    """Query-side embedding (a draft request being matched against SOPs).
    Applies BGE's retrieval instruction prefix internally via fastembed's
    query_embed()."""
    cleaned = _clean(text)
    if not cleaned:
        raise ValueError("Cannot generate embedding for empty text")
    model = _model()
    (vector,) = model.query_embed([cleaned])
    return vector.tolist()


def warm_up_embeddings() -> None:
    """Call once at app startup so the first real search isn't slow."""
    try:
        generate_embedding("warm up")
        logger.info("[embedding] Model ready")
    except Exception:  # pragma: no cover - best-effort warm-up only
        logger.exception(
            "[embedding] Could not load the embedding model. SOP indexing and AI "
            "Search will fail until it is available. Run "
            "`python -m app.scripts.download_embedding_model` (needs internet) or "
            "copy the model folder into %s.",
            get_model_cache_dir(),
        )
