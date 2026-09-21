# On-premise deployment

The frontend is a static Vite build. nginx serves it and reverse-proxies the
API, so the browser only ever talks to **one origin**.

```
                    ┌──────────────────────────────────────┐
  browser  ────────▶│ nginx :443                           │
                    │   /       → /var/www/srm-approval    │  (dist/)
                    │   /api/*  → 127.0.0.1:8000/*         │  (prefix stripped)
                    └──────────────────────────────────────┘
                                      │
                                      ▼
                          FastAPI backend :8000 (uvicorn)
```

## Why one origin

Not cosmetic — three things depend on it:

- **Authentication.** The `jwt` refresh cookie is `SameSite=Lax`. On a
  cross-site request the browser does not send it, `/auth/refresh` sees nothing
  on page load, and every reload signs the user out.
- **No CORS.** The browser never issues a cross-origin request.
- **A portable build.** No backend hostname is compiled into `dist/`, so the
  same artifact deploys to staging and production unchanged. The backend
  address lives only in `nginx.conf`.

---

## 1. Build

```bash
cd frontend
npm ci
npm run build        # → dist/
```

No environment variables are required. `dist/` is self-contained and portable.

> Check for a stale `frontend/.env`. If it still contains `VITE_API_URL`, it
> overrides the same-origin default and reintroduces CORS. Delete that line.

## 2. Deploy the static files

```bash
sudo mkdir -p /var/www/srm-approval
sudo rsync -a --delete dist/ /var/www/srm-approval/
sudo chown -R www-data:www-data /var/www/srm-approval
```

`--delete` matters: it clears out old fingerprinted assets from previous
builds, which otherwise accumulate forever.

## 3. Configure nginx

```bash
sudo cp deploy/nginx/srm-approval.conf /etc/nginx/sites-available/srm-approval
sudo ln -s /etc/nginx/sites-available/srm-approval /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

Edit every `CHANGE ME` in that file first: `server_name`, the TLS certificate
paths, `root`, and the backend address in the `upstream` block.

## 4. Backend configuration — **required**

Two changes on the API side. The first one is load-bearing: skip it and login
returns 403. Full backend deployment steps (systemd unit, `.env`, migrations)
are in [`backend/deploy/README.md`](../../backend/deploy/README.md); this is
just the piece specifically triggered by adding an nginx-fronted frontend.

### 4a. Add the site origin to `ALLOWED_ORIGINS`

In the backend's `.env` (see `backend/.env.example`):

```
ALLOWED_ORIGINS=["https://srm-approval.example.edu"]
```

This is needed *even though the API is same-origin*, and the failure mode is
deceptive. Browsers attach an `Origin` header to non-GET requests — including
same-origin ones — nginx forwards it, and FastAPI's `CORSMiddleware` rejects an
origin it does not recognise with a 403. GET requests carry no `Origin` and are
allowed through.

So if you skip this step the app looks *half* working: pages load and lists
populate, but **login fails and every approve / reject / query / upload returns
403**. Verified behaviour, not theory:

```
GET  /requests    Origin: (none)                  → allowed
POST /auth/login  Origin: https://srm-approval…   → 403 unless allowlisted
```

`ALLOWED_ORIGINS` only needs the real deployed origin(s) — it is not a place
to keep old dev entries around.

### 4b. Bind the backend to localhost

The systemd unit already does this (see
[`backend/deploy/systemd/srm-backend.service`](../../backend/deploy/systemd/srm-backend.service)):

```
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

so the backend is reachable only through nginx, never directly from the
network.

Set `TRUSTED_PROXY_IPS=["127.0.0.1"]` in `.env` so the backend honors nginx's
`X-Forwarded-For`/`X-Forwarded-Proto` headers — it derives cookie `Secure` and
its rate-limit keys from them.

Do **not** set `ALLOW_INSECURE_COOKIES` on an HTTPS deployment. It exists only
so plain-http localhost development works; in production it would let the
refresh token travel in clear text.

## 5. Verify

```bash
curl -I https://srm-approval.example.edu/           # 200, text/html
curl -I https://srm-approval.example.edu/requests   # 200 (SPA fallback, not 404)
curl -sI https://srm-approval.example.edu/api/auth/refresh | head -1   # reaches the API
```

Then in a browser, with devtools open:

1. Load the site — no CSP violations in the console.
2. Log in — the response sets a `jwt` cookie, and it shows `Secure`, `HttpOnly`,
   `SameSite=Lax` in Application → Cookies.
3. **Reload the page.** Still logged in. This is the check that matters: it is
   the one that fails when the cookie is not first-party.
4. Deep-link to `/requests/<some-id>` directly and refresh — the page renders
   rather than 404ing.

## Redeploying

```bash
npm ci && npm run build
sudo rsync -a --delete dist/ /var/www/srm-approval/
```

No nginx reload is needed. `index.html` is served `no-cache` and asset
filenames are content-hashed, so clients pick up the new build on next load
without a hard refresh.

---

## Notes

**`vercel.json` and `api/auth/[action].js` have been removed.** They were a
Vercel-only deployment path: a serverless function that did what the nginx
`location /api/` block below now does. Nothing on this server ever read them.

**`npm run preview` is not a production server.** It is Vite's local preview of
a build. Serve `dist/` through nginx.

**Troubleshooting**

| Symptom | Cause |
|---|---|
| Logged out on every reload | Refresh cookie not first-party or not `Secure`. Check `X-Forwarded-Proto` is reaching the backend, and that the app is not calling a cross-origin `VITE_API_URL`. |
| 403 on login | Site origin missing from `ALLOWED_ORIGINS` (step 4a). |
| Deep links 404 | SPA fallback missing — the `try_files $uri $uri/ /index.html` block. |
| API calls 404 | Lost trailing slash on `proxy_pass http://srm_backend/` — without it `/api` is not stripped. |
| 413 on upload | Raise `client_max_body_size`. |
| Blank page, CSP errors | A cross-origin `VITE_API_URL` was baked into the build; `connect-src 'self'` blocks it. |
