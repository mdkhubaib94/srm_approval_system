# Mongo → Postgres Migration Report

**Project:** `srm_approval_system_backend` — full rewrite from Node/Express/MongoDB to Python/FastAPI/PostgreSQL
**Status:** 10/10 phases complete · 137/137 tests passing
**Report date:** 2026-09-19

---

## 1. What the Docker setup is doing

There is no application container. Both compose files exist for one reason: giving the app and the test suite a disposable, real PostgreSQL with the `pgvector` extension already compiled in, since the SOP-matching subsystem needs genuine vector search, not a mock.

**Why `pgvector/pgvector:pg16` and not plain `postgres:16`** — the stock Postgres image has no `vector` type; `CREATE EXTENSION vector;` fails on it. `pgvector/pgvector:pg16` is Postgres 16 with the extension pre-built, which the SOP embedding search (Phase 6) depends on directly: `sop_chunks.embedding vector(384)` with an HNSW index and the `<=>` cosine-distance operator.

| | `docker-compose.yml` (dev) | `docker-compose.test.yml` (test) |
|---|---|---|
| Project name | `srm-backend-dev` | `srm-backend-test` |
| Database | `srm_approval` | `srm_approval_test` |
| Host port | `5442` → `5432` | `55432` → `5432` |
| Storage | named volume, persists | no volume, disposable |
| Used by | uvicorn dev server, seed scripts | pytest session (Alembic up/down each run) |

### Why two separate containers instead of one

Every pytest session runs a full Alembic `downgrade → upgrade` cycle against its database to prove the migrations themselves are correct. Pointed at the dev database, that would wipe seeded users and requests on every test run. Splitting dev and test onto separate containers — separate ports, separate named volumes, separate `name:` — means the two can run at the same time without one ever tearing down the other.

That last part was a real incident, not a precaution taken in the abstract: without an explicit `name:` field, Compose derives its project name from the directory, so both files resolved to the same project. The first `docker compose -f docker-compose.test.yml up` destroyed and recreated the dev container under that shared name. Pinning `name: srm-backend-dev` / `name: srm-backend-test` fixed it for good.

### Why port 5442 / 55432 instead of 5432

This machine already runs a native Windows PostgreSQL service on the default 5432. Both containers were moved off it — 5442 for dev, 55432 for test — to stop the two from silently colliding.

```yaml
# docker-compose.yml — the persistent dev database
name: srm-backend-dev

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: srm_approval
    ports:
      - "5442:5432"   # 5432 already taken by a native install
    volumes:
      - srm_pg_data:/var/lib/postgresql/data   # survives restarts
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
```

```yaml
# docker-compose.test.yml — disposable, rebuilt by Alembic every run
name: srm-backend-test

services:
  postgres:
    image: pgvector/pgvector:pg16
    environment:
      POSTGRES_DB: srm_approval_test
    ports:
      - "55432:5432"
    # no volume — schema is torn down / rebuilt every pytest session
```

Both are currently up and healthy on this machine: `srm-backend-dev-postgres-1` and `srm-backend-test-postgres-1`, one container each, one Postgres process each. Nothing else runs in Docker — FastAPI itself runs as a plain Python process from the project's `.venv`, in dev and under pytest alike.

---

## 2. Stack, side by side

Every load-bearing piece of infrastructure changed. Nothing here is a like-for-like rename — each row was a deliberate substitution made during the rewrite.

| Layer | Before | After |
|---|---|---|
| Runtime | Node.js + Express 5 | Python 3.13 + FastAPI (ASGI / Uvicorn) |
| Database | MongoDB + Mongoose | PostgreSQL 16 + SQLAlchemy 2.0 (async, asyncpg) + Alembic |
| Validation | Mongoose schema validators | Pydantic v2 |
| Auth | jsonwebtoken + bcrypt | PyJWT + bcrypt (direct, no passlib) |
| Scheduler | node-cron | APScheduler, in-process, wired into FastAPI's lifespan |
| Embeddings | @xenova/transformers (ONNX, in-process JS) | fastembed (ONNX Runtime), BAAI/bge-small-en-v1.5 |
| Vector search | Hand-rolled in-memory cosine similarity | pgvector, HNSW index, native `<=>` operator |
| PDF / OCR | mupdf, pdf-parse, tesseract.js | PyMuPDF (fitz) + pytesseract |
| File storage | GridFS (MongoDB) | Local filesystem + `files` metadata table |
| Email | nodemailer | httpx (Brevo API) + aiosmtplib (SMTP), same provider rule |
| Security headers | helmet | Custom `SecurityHeadersMiddleware` (Starlette) |
| Rate limiting | express-rate-limit | Custom `GlobalRateLimitMiddleware`, same four tiers |
| Local infra | none — bare Mongo connection string | Docker Compose ×2, `pgvector/pgvector:pg16` |
| Tests | `"test": "echo … && exit 1"` | pytest + pytest-asyncio, 137 passing against real Postgres |

| Metric | Before | After |
|---|---|---|
| Source files | 79 | 90 |
| Lines of app code | 11,616 | 9,272 |
| Test files | 0 | 24 |
| Alembic migrations | — | 5 |

---

## 3. What changed, phase by phase

Each phase closed with its own passing pytest suite before the next began.

### Phase 0 — Scaffolding

**Before:** No project scaffolding to speak of — `server.js` + a flat `src/` tree. Single Mongo connection string, no local infra file.

**After:** Domain-oriented FastAPI skeleton (`app/<domain>/router.py,schemas.py,models.py,service.py`). Async SQLAlchemy engine/session, Alembic initialised, two Docker Compose stacks, `CREATE EXTENSION vector;`. pytest scaffold: session-scoped migrated test DB, per-test transaction rollback.

*Verified: `GET /health` round-trips a row through the real test database.*

### Phase 1 — User model & full auth loop

**Before:** `User.js` Mongoose schema, 16 roles. `authController.js`, `otpCache.js`, `resetToken.js`.

**After:** `users` table with the same 16-role enum; signup OTP allowlist ported verbatim. Timing-safe login (dummy-hash comparison on not-found), tokenVersion-based refresh revocation + rotation, fingerprinted single-use reset tokens.

Every failure path keeps the identical message/timing discipline from the source — this is the one area the plan explicitly said not to "improve," since the original comments document a past enumeration bug here.

### Phase 2 — Core request workflow + 2 reference detail types

**Before:** Embedded action-history array on the Mongo `Request` document. `request.constants.js` (stage sequences), `access.js` (view/act rules).

**After:** `requests` + promoted `request_action_history` table (needed to index "requests I acted on"). `workflow.py` and `access.py` kept pure / DB-free by design, so both are unit-testable without a database fixture. First two detail tables: `MouDetail` (plain) and `EquipmentPurchaseDetail` (indent-capable), forcing the shared indent-table plumbing to exist from day one.

### Phase 3 — Remaining 12 detail types + indent tables

**Before:** 15 files under `src/models/details/`, dispatched by Mongoose's `refPath`. `GenericDetail` — a 15th, untyped fallback model used only by seed/test scripts.

**After:** 14 typed Postgres tables, dispatched through a frozen `registry.py` dict — never a dynamic lookup, mirroring the source's own RCE-avoidance comment. `GenericDetail` deliberately dropped: typed tables + real pytest factories removed the reason it existed. 6 indent-capable types share one generic `owner_table`/`owner_id` pair instead of duplicating columns.

### Phase 4 — Policy / Query / Completed / Flagged

**Before:** Separate Mongoose collections, same names. `flaggedAt[]` array of user refs on the Flagged document.

**After:** Query raise pauses the SLA clock (status → `QUERY`), resolve resumes it — same behaviour, now backed by real rows. `flagged_users` promoted to its own child table in place of the array. Policy fields split into two Pydantic response schemas by viewer role.

### Phase 5 — File storage + upload / download

**Before:** GridFS, one shared bucket, IDs as storage keys.

**After:** Local filesystem + one `files` table + 5 per-owner join tables (request/policy/query/completed/sop). Server-generated on-disk filenames — client filenames never touch the path, same anti-traversal discipline as the GridFS keys. PDF magic-byte validation; download endpoint forces `application/pdf` + attachment disposition; ordered owner-resolution, 404-on-deny (never 403).

### Phase 6 — SOP / embeddings / OCR + pgvector

**Before:** `embeddingService.js` (@xenova/transformers), cosine similarity computed by hand in JS. `sopIndexService.js`, `pdfTextService.js`, `sopSearchCache.js`.

**After:** `sops` / `sop_chunks` tables, `vector(384)` columns, HNSW index. fastembed's asymmetric `query_embed()` / `passage_embed()` preserved exactly — losing this silently degrades match quality with no visible error. Same chunk target/max/overlap constants and boilerplate-stripping regexes carried over, since they were tuned against real SOP documents, not redesigned. Sequential single-worker index queue + periodic stuck-job sweep, same bounded-memory design.

### Phase 7 — Cron / background jobs

**Before:** `cronWorker.service.js` on node-cron.

**After:** APScheduler jobs: hourly business-hours-gated SLA sweep (7h warning, 8h breach → Flagged), daily overdue-completion sweep, 10-minute SOP sweep. Job functions take an optional injected session so tests can exercise them directly under a frozen clock, inside the same transaction as the data they need to see.

### Phase 8 — Email

**Before:** `mailTransport.js` / `emailService.js` on nodemailer.

**After:** httpx for the Brevo HTTP API, aiosmtplib for SMTP — identical selection rule: presence of `BREVO_API_KEY` picks Brevo, otherwise SMTP. Jinja2 templates per message type; a transport failure never raises out of the calling request handler.

### Phase 9 — Seed scripts & hardening

**Before:** 5 separate scripts: `seedUsers.js`, `seedRequests.js`, `seedCompleted.js`, `seedFlagged.js`, plus two near-duplicate `clearDbExceptUsers*.js`.

**After:** Same 4 seed scripts ported 1:1, run and verified against the real dev database this session. The two clear-db scripts collapsed into one parametrized `clear_db.py --keep users,sops`, driven off SQLAlchemy's own FK-dependency graph instead of a hand-maintained table list. CORS allowlist, security headers, and a global rate limiter added; final cross-phase smoke test written.

Run this session: `seed_completed.py` (4 approved requests + 4 completions), `seed_flagged.py` (8 flagged records), `clear_db.py --dry-run`, `index_sops_backfill.py`, `email_diagnostic.py` — all against the live dev container, all clean.

---

## 4. Bugs caught during the build

A rewrite surfaces problems a straight transliteration wouldn't — these were found and fixed before they reached the test suite's blind spots, not carried over from the original.

- **Security-headers middleware crashed every request.** Starlette's `MutableHeaders` has no `.pop()`; a leftover `response.headers.pop("Server", None)` took down all 130 tests the moment the middleware was wired in. Removed the line — uvicorn injects its own `Server` header below this layer regardless, so the intended effect wasn't reachable here anyway.
- **`AsyncSession.get(Model, id, options=…)` silently drops eager-load options** when the row is already in the session's identity map. Replaced every call site with a `get_with_options()` helper that always issues an explicit `select().options()`.
- **Background jobs couldn't see a test's own uncommitted data.** `index_sop_document` and the two cron-worker functions opened a fresh DB connection by default, which can't see another session's in-flight transaction. Gave each an optional injected session parameter.
- **Docker Compose project-name collision destroyed the dev container.** Starting the test stack without an explicit `name:` field recreated the dev Postgres container under the same default project name (see §1).
- **Alembic downgrade left orphaned Postgres ENUM types.** `op.drop_table()` doesn't drop the enum types backing its columns, breaking the downgrade→upgrade cycle pytest runs once per session. Every migration now explicitly drops its enums in `downgrade()`.
- **Refresh tokens issued in the same second were byte-identical.** Added a `jti` nonce claim to the refresh-token payload.
- **`clear_db.py`'s first draft could orphan a kept owner's own files.** The initial file-pruning conditional could clear a kept owner's attachment join table anyway (e.g. wipe `sop_attachments` while keeping `sops`), disconnecting its files before they were checked. Replaced with an explicit owner → join-table map, caught before the script was ever run.
- **Em dashes in seed-script output mangled on the Windows console.** cp1252 can't render `—`; replaced with plain hyphens across all 7 script files.

---

## 5. Testing: 0 → 137

The source's `package.json` test script was `echo "Error: no test specified" && exit 1` — there was no automated coverage at all. Every test below is new, and runs against a real Postgres + pgvector instance rather than a mock.

- Auth: failure-message/timing parity, refresh rotation + tokenVersion revocation, OTP cooldown/expiry, reset-token single-use expiry
- Workflow: stage sequencing incl. accountant-skip-on-zero-cost, stage-holder-only enforcement, 404-vs-403 visibility discipline, all 14 detail types parametrized
- Files: spoofed-MIME rejection, oversized/over-count rejection, forced-PDF download headers, cross-owner access rules
- SOPs: OCR-vs-text-layer path selection, chunking, hybrid vector + keyword scoring, threshold behaviour
- Cron jobs: frozen-clock assertions, no duplicate Flagged rows across repeated sweeps, business-hours gating
- Hardening: security headers on success and error paths, body-size limits, global rate limiting, multipart exemption
- One full cross-phase smoke test: create → query pause/resume → forward through all 9 stages of a category → CHAIRMAN approval → Completed spawn → file re-download → mark actually complete

---

**Current git status:** `python_backend/` is untracked — not yet committed.
