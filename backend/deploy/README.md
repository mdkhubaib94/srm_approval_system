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

Copy this `backend/` directory's contents to `/opt/srm-backend` (excluding
`.venv/`, `__pycache__/`, `.pytest_cache/`).

## 2. Python environment

Requires Python 3.14+.

```bash
cd /opt/srm-backend
sudo -u srm-backend python3.14 -m venv .venv
sudo -u srm-backend .venv/bin/pip install -r requirements-lock.txt
```

## 3. Database

No Postgres extensions are required — SOP semantic search embeddings are
stored as plain arrays and scored in Python, so a stock PostgreSQL 16
install (no `pgvector` or other extension access needed) is enough.

Run migrations:

```bash
sudo -u srm-backend .venv/bin/alembic upgrade head
```

This also seeds `role_permissions` (which roles can download PDF attachments
on the request detail page) with every role granted, matching pre-existing
behavior. If that table ever ends up empty on this server — e.g. it was
created by hand instead of via `alembic upgrade head`, or a future
permission key needs its default before its own migration lands — restore
the default without touching any permission an admin has already
customized via **User Management → Manage permissions**:

```bash
sudo -u srm-backend .venv/bin/python -m app.scripts.seed_role_permissions
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

## 5. Install the systemd unit

```bash
sudo cp deploy/systemd/srm-backend.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now srm-backend
```

Do **not** add `--workers`/multiple instances — see the comment in
`srm-backend.service` about the in-process APScheduler jobs.

## 6. Verify

```bash
curl -s 127.0.0.1:8000/health          # {"status":"ok"}
curl -s -o /dev/null -w '%{http_code}\n' 127.0.0.1:8000/docs   # 404 (production)
journalctl -u srm-backend -f           # live logs
tail -f /opt/srm-backend/logs/app.log  # same logs, on disk
```

Then confirm through nginx once its config points at this upstream: log in
from the deployed frontend and confirm both reads (GET) and writes
(login, creating a request) succeed — a common failure mode is `ALLOWED_ORIGINS`
missing the frontend's origin, which lets GETs through but silently 403s
cookie-authenticated writes.
