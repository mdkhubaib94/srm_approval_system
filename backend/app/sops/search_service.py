"""Hybrid SOP semantic search. Reference: src/services/sopSearchCache.js +
the scoring logic in src/controllers/sopController.js's analyzeSopMatch.

The vector half of the score is computed in Python with numpy (cosine
similarity against every active SOP's/chunk's embedding) rather than via
Postgres/pgvector's `<=>` operator — the on-prem target Postgres has no
extension-install access, so there's no `vector` column type or ANN index to
query against. At the documented corpus scale (~200-300 SOPs), scoring every
embedding on each request is cheap enough that this is a non-issue; it's
close to what the pre-migration Node version did with its in-memory loop.

The keyword half is a direct, unchanged port of the source's IDF-weighted
keyword-overlap algorithm: it needs genuine corpus-wide document-frequency
statistics ("how rare is this token across every SOP"), which Postgres's
`ts_rank` does not give us for free (ts_rank weights term position/frequency
within one document, not rarity across the corpus) — so re-implementing it
faithfully means keeping it in Python. At the documented corpus scale
(~200-300 SOPs), computing it fresh per request over just the text columns
(never the embeddings) is cheap enough that the source's stateful,
invalidate-on-write in-memory cache is no longer worth the complexity it
costs elsewhere — this collapses to a plain function with no cache to get
out of sync.
"""

import math
import os
import re
from dataclasses import dataclass, field

import numpy as np
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.sops.models import Sop, SopChunk


def _cosine_similarity(query: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Cosine similarity of `query` against every row of `matrix`."""
    query_norm = np.linalg.norm(query)
    matrix_norms = np.linalg.norm(matrix, axis=1)
    denom = np.where(matrix_norms * query_norm == 0, 1.0, matrix_norms * query_norm)
    return (matrix @ query) / denom

def invalidate_sop_cache() -> None:
    """No-op. The source's sopSearchCache.js needed explicit invalidation
    because it kept a stateful in-memory index that had to be told when a
    SOP changed; this port has no such cache (see module docstring) — kept
    as a call site for parity with the source's create/update/delete/reindex
    call sites, in case a cache is reintroduced later at higher scale."""


MATCH_THRESHOLD = float(os.environ.get("SOP_MATCH_THRESHOLD", "0.45"))
# Document chunks are noisier than a hand-written description (OCR errors,
# residual boilerplate), so their scores carry a small handicap.
CHUNK_SCORE_PENALTY = float(os.environ.get("SOP_CHUNK_PENALTY", "0.05"))
# Max additive boost from IDF-weighted keyword overlap.
KEYWORD_BOOST = float(os.environ.get("SOP_KEYWORD_BOOST", "0.15"))

STOPWORDS = {
    "the", "a", "an", "and", "or", "of", "to", "in", "for", "on", "at", "by",
    "with", "is", "are", "was", "were", "be", "been", "being", "as", "it",
    "its", "this", "that", "these", "those", "from", "will", "shall", "may",
    "should", "would", "can", "could", "has", "have", "had", "not", "no",
    "all", "any", "each", "per", "etc", "also", "such", "other", "than",
    "into", "about", "regarding", "request", "requests", "sop", "order",
    "management", "institution", "institutions", "srm",
}

_TOKEN_SPLIT_RE = re.compile(r"[^a-z0-9]+")
_DIGITS_ONLY_RE = re.compile(r"^\d+$")


def tokenize(text: str) -> list[str]:
    lowered = (text or "").lower()
    return [
        t
        for t in _TOKEN_SPLIT_RE.split(lowered)
        if len(t) >= 2 and t not in STOPWORDS and not _DIGITS_ONLY_RE.match(t)
    ]


@dataclass
class _CorpusEntry:
    sop_id: int
    token_set: set[str] = field(default_factory=set)


async def _build_keyword_corpus(db: AsyncSession) -> tuple[dict[int, _CorpusEntry], dict[str, float]]:
    """Corpus-wide token sets + IDF weights, over active SOPs' text columns
    only (never embeddings)."""
    sop_rows = (
        await db.execute(select(Sop.id, Sop.reference_number, Sop.title, Sop.description).where(Sop.is_active.is_(True)))
    ).all()
    chunk_rows = (await db.execute(select(SopChunk.sop_id, SopChunk.text))).all()

    chunks_by_sop: dict[int, list[str]] = {}
    for sop_id, text in chunk_rows:
        chunks_by_sop.setdefault(sop_id, []).append(text)

    entries: dict[int, _CorpusEntry] = {}
    for sop_id, reference_number, title, description in sop_rows:
        full_text = " ".join([reference_number, title, description, *chunks_by_sop.get(sop_id, [])])
        entries[sop_id] = _CorpusEntry(sop_id=sop_id, token_set=set(tokenize(full_text)))

    df: dict[str, int] = {}
    for entry in entries.values():
        for token in entry.token_set:
            df[token] = df.get(token, 0) + 1

    n = max(len(entries), 1)
    idf = {token: math.log(1 + n / count) for token, count in df.items()}

    return entries, idf


def keyword_overlap(query_tokens: list[str], entry: _CorpusEntry, idf: dict[str, float]) -> float:
    """IDF-weighted keyword overlap between a query and one SOP: the
    fraction of the query's "rare-token mass" found in the SOP."""
    if not query_tokens:
        return 0.0
    matched = 0.0
    total = 0.0
    for token in query_tokens:
        weight = idf.get(token, 0.0)  # unseen tokens carry no signal
        total += weight
        if token in entry.token_set:
            matched += weight
    return matched / total if total > 0 else 0.0


@dataclass
class SopMatch:
    sop_id: int
    reference_number: str
    title: str
    score: float
    vector_score: float
    keyword_boost: float
    matched_via: str
    matched_page: int | None = None
    matched_snippet: str | None = None


async def analyze_sop_match(db: AsyncSession, query_text: str, raw_query_text: str) -> list[SopMatch]:
    """Score every active SOP against `query_text` (already embedding-ready,
    e.g. "title. description. Category: X") and `raw_query_text` (used for
    keyword tokenization, mirrors the source's separate title+description
    token source). Returns all matches sorted best-first."""
    from .embedding_service import generate_query_embedding

    query_embedding = np.array(generate_query_embedding(query_text))
    query_tokens = tokenize(raw_query_text)

    # Vector half: fetch every active SOP's/chunk's embedding and score them
    # in Python — one pass for the description side, one for the
    # best-matching chunk per SOP (grouped by sop_id, keeping the max score).
    desc_candidates = (
        await db.execute(
            select(Sop.id, Sop.reference_number, Sop.title, Sop.description_embedding).where(
                Sop.is_active.is_(True), Sop.description_embedding.is_not(None)
            )
        )
    ).all()
    desc_rows = []
    if desc_candidates:
        desc_scores = _cosine_similarity(
            query_embedding, np.array([row.description_embedding for row in desc_candidates])
        )
        desc_rows = [
            {"id": row.id, "reference_number": row.reference_number, "title": row.title, "score": score}
            for row, score in zip(desc_candidates, desc_scores)
        ]

    chunk_candidates = (
        await db.execute(
            select(SopChunk.sop_id, SopChunk.page, SopChunk.text, SopChunk.embedding).where(
                SopChunk.embedding.is_not(None)
            )
        )
    ).all()
    best_chunk_by_sop: dict[int, dict] = {}
    if chunk_candidates:
        chunk_scores = _cosine_similarity(query_embedding, np.array([row.embedding for row in chunk_candidates]))
        for row, raw_score in zip(chunk_candidates, chunk_scores):
            existing = best_chunk_by_sop.get(row.sop_id)
            if existing is None or raw_score > existing["raw_score"]:
                best_chunk_by_sop[row.sop_id] = {
                    "sop_id": row.sop_id,
                    "page": row.page,
                    "text": row.text,
                    "raw_score": raw_score,
                }

    entries, idf = await _build_keyword_corpus(db)

    matches: list[SopMatch] = []
    for row in desc_rows:
        desc_score = float(row["score"])
        chunk = best_chunk_by_sop.get(row["id"])
        chunk_score = float(chunk["raw_score"]) - CHUNK_SCORE_PENALTY if chunk is not None else None

        use_chunk = chunk_score is not None and chunk_score > desc_score
        vector_score = chunk_score if use_chunk else desc_score

        entry = entries.get(row["id"], _CorpusEntry(sop_id=row["id"]))
        overlap = keyword_overlap(query_tokens, entry, idf)
        keyword_boost = KEYWORD_BOOST * overlap
        score = min(1.0, vector_score + keyword_boost)

        snippet = None
        if use_chunk and chunk is not None:
            snippet = chunk["text"][:220] + ("…" if len(chunk["text"]) > 220 else "")

        matches.append(
            SopMatch(
                sop_id=row["id"],
                reference_number=row["reference_number"],
                title=row["title"],
                score=score,
                vector_score=round(vector_score, 4),
                keyword_boost=round(keyword_boost, 4),
                matched_via="document" if use_chunk else "description",
                matched_page=chunk["page"] if (use_chunk and chunk is not None) else None,
                matched_snippet=snippet,
            )
        )

    matches.sort(key=lambda m: m.score, reverse=True)
    return matches
