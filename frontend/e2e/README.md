# End-to-end regression tests (Playwright)

Browser + API regression suite for the SRM PRIME Approval System.

## Safety

The suite **never touches a development or production database.** It starts its
own stack:

| Piece | What |
|---|---|
| Database | Fresh `srm_approval_e2e` DB on the disposable test Postgres (`backend/docker-compose.test.yml`, host port **55432**). Dropped and recreated on every run. |
| Backend | `e2e/support/run_e2e_backend.py` migrates + seeds (one user per role, password `123456`) and serves on `:5001`. Hard-coded to refuse any DB other than `localhost:55432`. |
| Frontend | `vite` dev server on `:5174`, proxying `/api` to `:5001`. |

## Run

```bash
docker compose -f backend/docker-compose.test.yml up -d   # test Postgres
cd frontend
npm ci
npx playwright install chromium
npm run test:e2e
```

Reports: `e2e/playwright-report/index.html` (HTML), `e2e/reports/results.json`.
Screenshots are captured for every test; traces are kept for failures.

Environment overrides: `E2E_FRONTEND_DIR` (test another checkout, e.g. a clean
worktree of a release commit), `E2E_PYTHON`, `E2E_API_PORT`, `E2E_FRONTEND_PORT`.

## What is covered

| Spec | Area |
|---|---|
| `01-auth` | Login (email / employee ID), bad password, route guards, session refresh, logout, API 401s, cookie flags, security headers, 10 MB body cap |
| `02-navigation-rbac` | Sidebar per role, every top-level page renders for an allowed role, UI + API access denial |
| `03-request-lifecycle` | Create (API and full UI form), list/detail, stage holder actions, forward/reject, cost-based routing, form validation |
| `04-profile-and-content` | Profile, flow categories, empty states, all-role dashboards, unknown routes, mobile layout |

## Known defect marker

`REQ-06` is annotated `test.fail()`: a REQUESTER can currently forward their own
request past the approvers. The test asserts the *secure* behaviour; once the
backend is fixed it will report "unexpected pass" - remove the annotation then.

## Notes

- Tests run serially (`workers: 1`) because they share one database.
- The backend launcher lifts the global per-IP API rate limiter (300 req/min)
  for the harness only; app code is unchanged.
