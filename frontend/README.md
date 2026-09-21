# SRM PRIME Approval System — Frontend

React 19 + Vite SPA, using React Router for routing and Tailwind v4 for styling.
Migrated from Next.js (App Router); see [Architecture](#architecture) for the
parts of that migration worth knowing about.

## Quick start

```bash
npm ci
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` to the backend at `http://localhost:5000`. Point
it elsewhere with `API_PROXY_TARGET` in a local `.env` — see `.env.example`.

The backend must be running separately, and its CORS allowlist
(`backend/src/config/allowedOrigins.js`) must include `http://localhost:5173`.

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server with HMR |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Preview a build locally (**not** a production server) |
| `npm run lint` | ESLint, including React Compiler rules |

## Deployment

On-premise deployment (nginx + TLS) is documented in
**[`deploy/README.md`](deploy/README.md)**, with the site config in
[`deploy/nginx/`](deploy/nginx/).

## Architecture

### Everything is same-origin

The browser only ever talks to one origin. Both the SPA and the API are served
from it, and a proxy strips the `/api` prefix before forwarding:

```
/api/requests    →  <backend>/requests
/api/auth/login  →  <backend>/auth/login
```

That proxy is `server.proxy` in `vite.config.js` during development, and the
`location /api/` block in `deploy/nginx/` in production.

This matters for three reasons:

- **Authentication depends on it.** The `jwt` refresh cookie is `SameSite=Lax`,
  so it is only sent same-site. Cross-origin, `/auth/refresh` sees no cookie on
  page load and the user is signed out on every reload.
- **There is no CORS** to configure for the browser.
- **The build is portable.** No backend hostname is compiled into `dist/`, so
  one artifact deploys anywhere; the backend address lives in the proxy config.

`VITE_API_URL` can override this to point at a cross-origin backend, but doing
so opts back into CORS and breaks the refresh cookie unless the backend moves
to `SameSite=None; Secure`. The session endpoints stay same-origin regardless.

### Auth flow

- The access token lives **in memory only** — never `localStorage` — so XSS
  cannot read it. `src/lib/api.js` attaches it as a Bearer token.
- The refresh token exists only as an httpOnly cookie. On load, the app
  exchanges it via `/auth/refresh` for a fresh access token.
- A non-sensitive cached user profile is kept in `localStorage` purely to avoid
  a login-screen flash on reload. It is never trusted for authorization.
- A 401 triggers a single shared refresh and replays the request once
  (`src/lib/api.js`); concurrent failures share one in-flight refresh.

### React Compiler

Enabled via `babel-plugin-react-compiler` in `vite.config.js`. The compiler's
lint rules ship with `eslint-plugin-react-hooks` and run under `npm run lint`;
`npm run lint` is clean except for one known `react-hook-form` limitation
(`watch()` cannot be memoized safely — a library constraint, not app code).

Because the compiler memoizes automatically, prefer letting it do that work
rather than hand-writing `useMemo`/`useCallback` around it.

### Notes from the Next.js migration

- `next/navigation` → `react-router-dom` (`useNavigate`, `useParams`,
  `useSearchParams`); `next/link` → `<Link to>`; `next/image` → `<img>`.
- File-system routing → explicit routes in `src/AppRoutes.jsx`.
- `NEXT_PUBLIC_*` → `VITE_*` (`import.meta.env`).
- The Next.js Route Handler that proxied the auth endpoints is now the job of
  the dev proxy and nginx.
- `vercel.json` and `api/auth/[action].js` were a **Vercel-only** deployment
  path and have been removed — this project deploys on-premise via nginx
  (see `deploy/nginx/`), which proxies `/api/*` straight to the backend.
