# Backend on-prem deployment (Linux + systemd + nginx)

Assumes nginx runs on the same host and reverse-proxies to this app on
`127.0.0.1:8000` (see the frontend's `deploy/nginx/srm-approval.conf` for the
nginx side, which already documents the `# CHANGE ME` upstream address).

## 1. Service user and app directory

```bash
sudo useradd --system --home /opt/srm-backend --shell /usr/sbin/nologin srm-backend
sudo mkdir -p /opt/srm-backend
sudo chown srm-backend:srm-backend /opt/srm-backend
```

Get the code onto the server, then copy this `backend/` directory's contents
to `/opt/srm-backend`:

```bash
git clone https://github.com/mdkhubaib94/srm_approval_system.git /tmp/srm
sudo cp -r /tmp/srm/backend/. /opt/srm-backend/
sudo mkdir -p /opt/srm-backend/storage /opt/srm-backend/logs
sudo chown -R srm-backend:srm-backend /opt/srm-backend
```

## 2. Python environment

Requires Python 3.14+.

```bash
cd /opt/srm-backend
sudo -u srm-backend python3.14 -m venv .venv
sudo -u srm-backend .venv/bin/pip install -r requirements-lock.txt
```

Scanned SOP PDFs are read with RapidOCR, which is installed by the pip
step above (its models ship inside the package) — no system packages needed.

## 3. Database

No Postgres extensions are required — SOP semantic search embeddings are
stored as plain arrays and scored in Python, so a stock PostgreSQL 16
install (no `pgvector` or other extension access needed) is enough.

Run migrations:

```bash
sudo -u srm-backend .venv/bin/alembic upgrade head
```

## 4. Configuration

```bash
sudo -u srm-backend cp .env.example .env
sudo -u srm-backend chmod 600 .env
```

Edit `/opt/srm-backend/.env` and set, at minimum:

- `ENVIRONMENT=production` — disables `/docs`, `/redoc`, `/openapi.json`, and
  makes startup fail loudly if the secrets below are left at their defaults.
- `ACCESS_TOKEN_SECRET` / `REFRESH_TOKEN_SECRET` — generate with
  `openssl rand -hex 64` each. Startup refuses to boot with the placeholder
  values when `ENVIRONMENT=production`.
- `DATABASE_URL` — real on-prem Postgres connection string.
- `ALLOWED_ORIGINS` — the real nginx-served frontend origin(s), e.g.
  `["https://srm.yourcompany.internal"]`.
- `TRUSTED_PROXY_IPS` — `["127.0.0.1"]` if nginx runs on the same host as
  this app, so `X-Forwarded-For`/`X-Forwarded-Proto` are honored for the
  real client IP and scheme.
- `ALLOW_INSECURE_COOKIES=false` (TLS is expected to be terminated at nginx).
- Email (SMTP vars) and `FRONTEND_URL`.

## 5. SOP AI model (automatic)

Nothing to do if the server can reach `huggingface.co`. On every start the
backend sets up the local embedding model (`BAAI/bge-small-en-v1.5`, about
100 MB) in the background: it downloads it into `/opt/srm-backend/storage/ai-models`
on first run, retries every few minutes if the
download fails, and as soon as the model is ready it indexes every SOP that
is pending, failed, or was created while the model was unavailable. The rest
of the app works normally meanwhile; SOP uploads made in that window are
indexed automatically once the model is ready.

Watch it happen:

```bash
journalctl -u srm-backend -f | grep -E "embedding|sopIndex"
# [embedding] Model ready
# [sopIndex] AI model ready - indexing N SOP(s) automatically
```

**Server has no internet access:** the log repeats `Could not load the AI
model`. Download the model on any machine with internet from a checkout of
`backend/`, then copy its `backend/storage/ai-models/` folder to the server (the backend
picks it up on its next retry; no restart needed):

```bash
# on the machine with internet (in backend/)
python -m app.scripts.download_embedding_model
tar czf models.tgz -C storage ai-models
scp models.tgz user@SERVER:/tmp/

# on the server
sudo tar xzf /tmp/models.tgz -C /opt/srm-backend/storage
sudo chown -R srm-backend:srm-backend /opt/srm-backend/storage/ai-models
cd /opt/srm-backend && sudo -u srm-backend .venv/bin/python -m app.scripts.download_embedding_model
```

The model folder lives under `storage/`, which is git-ignored; it is never committed.

## 6. Install the systemd unit

```bash
sudo cp deploy/systemd/srm-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now srm-backend
```

Do **not** add `--workers`/multiple instances — see the comment in
`srm-backend.service` about the in-process APScheduler jobs.

## 7. Verify

```bash
curl -s 127.0.0.1:8000/health          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8000/docs   # 404 (production)
journalctl -u srm-backend -f           # live logs
tail -f /opt/srm-backend/logs/app.log  # same logs, on disk
journalctl -u srm-backend | grep embedding   # expect "[embedding] Model ready"
```

SOP indexing check: open **SOPs**, click **Re-index** on any SOP, and watch
`journalctl -u srm-backend -f | grep sopIndex`. Any SOP that previously
failed can be re-indexed in one go:

```bash
cd /opt/srm-backend && sudo -u srm-backend .venv/bin/python -m app.scripts.index_sops_backfill
```

Then confirm through nginx once its config points at this upstream: log in
from the deployed frontend and confirm both reads (GET) and writes
(login, creating a request) succeed — a common failure mode is `ALLOWED_ORIGINS`
missing the frontend's origin, which lets GETs through but silently 403s
cookie-authenticated writes.
