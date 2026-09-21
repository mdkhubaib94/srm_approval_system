# SRM PRIME Approval System

A request/approval workflow system for SRM institutions — requests, policies,
queries, SOPs (with AI-assisted search), and a role-based multi-step approval
chain.

- **`frontend/`** — React 19 + Vite SPA (see [`frontend/README.md`](frontend/README.md) for frontend-specific architecture notes)
- **`backend/`** — FastAPI + PostgreSQL API
- **`sops/`** — sample SOP/MOU PDF documents, useful for exercising the SOP upload + AI search feature locally

This guide gets both halves running locally from a clean checkout.

## Prerequisites

- **Python 3.14+**
- **Node.js 20+** and npm
- **Docker** (for the local Postgres container) — or a Postgres 16 instance of your own
- **git**
- Optional: a system `tesseract` binary (`apt-get install tesseract-ocr` / `brew install tesseract`) — only needed for OCR fallback on scanned SOP PDFs that have no text layer. Everything else works without it.

## 1. Clone

```bash
git clone https://github.com/mdkhubaib94/srm_approval_system.git
cd srm_approval_system
```

## 2. Backend setup

```bash
cd backend
python -m venv .venv

# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements-lock.txt
```

Copy the env template and fill in real values for anything marked
`change-me` (JWT secrets, email credentials if you need outgoing email):

```bash
cp .env.example .env
```

Start Postgres (mapped to host port **5442**, not 5432, to avoid clashing
with a native Postgres install — this is already reflected in `.env.example`):

```bash
docker compose up -d
```

Run migrations:

```bash
alembic upgrade head
```

Start the API:

```bash
uvicorn app.main:app --reload --port 5000
```

The API is now at `http://localhost:5000`. With `ENVIRONMENT=development`
(the default), interactive docs are at `http://localhost:5000/docs`.

### Seed demo data (optional but recommended)

```bash
python -m app.scripts.seed_users       # one user per role, password: 123456
python -m app.scripts.seed_requests    # sample requests
python -m app.scripts.seed_flagged     # sample flagged items
python -m app.scripts.seed_completed   # sample completed items
```

`seed_users.py` lists every seeded email/role — check that file for the
account you want to log in as (e.g. `requester@gmail.com` / `123456`).

## 3. Frontend setup

In a second terminal:

```bash
cd frontend
npm ci
npm run dev
```

The app is now at `http://localhost:5173`. No `.env` is required — the dev
server proxies `/api` straight to `http://localhost:5000` (see
`frontend/.env.example` if you need to point it elsewhere).

Log in with any seeded account above, or sign up a new `REQUESTER` account
(self-signup is enabled for that role by default).

## 4. Running backend tests

Tests run against a disposable, separate Postgres container so they never
touch your dev database:

```bash
cd backend
docker compose -f docker-compose.test.yml up -d
pytest
```

## SOP sample documents

The PDFs in [`sops/`](sops) are real SOP/MOU documents you can upload through
the app's **Create SOP** page to try out text extraction and AI-assisted
search end to end.

## On-premises deployment

This system is designed to run entirely on-prem — no cloud services are
required. A typical deployment is a single Linux host running:

```
                    ┌──────────────────────────────────────┐
  browser  ────────▶│ nginx :443 (TLS terminates here)      │
                    │   /       → static frontend build     │  (dist/)
                    │   /api/*  → 127.0.0.1:8000/* (FastAPI) │
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                         PostgreSQL 16 (same host or reachable)
```

- Frontend is built to static files and served by nginx.
- Backend runs as a systemd service (`uvicorn`, single instance — it runs
  in-process scheduled jobs, so no multi-worker/load-balanced setup) bound to
  `127.0.0.1` and reverse-proxied by nginx.
- Postgres needs no extensions (SOP embeddings are stored as plain arrays),
  so a stock PostgreSQL 16 install is sufficient.
- nginx is the single public entry point and the only place TLS is
  configured; the frontend and backend must appear as one origin to the
  browser (this matters for cookie-based auth and CORS — see the frontend
  deploy guide below).

Full step-by-step instructions:

- [`backend/deploy/README.md`](backend/deploy/README.md) — service user,
  Python venv, migrations, `.env` production settings, and the systemd unit
- [`frontend/deploy/README.md`](frontend/deploy/README.md) — production
  build, nginx config, and the CORS/cookie requirements for same-origin
  deployment

Neither guide requires Docker in production — `docker-compose.yml` here is
for local development only.

## Troubleshooting

- **Port already in use**: Postgres dev DB uses `5442` and the test DB uses
  `55432` specifically to avoid colliding with a locally installed Postgres
  on `5432`. Backend defaults to `5000`, frontend to `5173`.
- **Login works then immediately logs out on reload**: the refresh token is
  a same-site cookie; make sure you're hitting the frontend's own origin
  (`http://localhost:5173`) and letting its dev proxy forward to the API,
  rather than calling the backend directly from the browser.
- **First SOP search is slow**: the embedding model
  (`BAAI/bge-small-en-v1.5`) downloads on first use and is cached after that.
