"""Start an isolated FastAPI backend for the Playwright E2E suite.

Creates a fresh `srm_approval_e2e` database on the disposable Docker test
Postgres (backend/docker-compose.test.yml, host port 55432), migrates it,
seeds one user per role (password 123456) and then serves the API on :5001.

Hard safety guard: refuses to run against anything but localhost:55432, so the
suite can never touch a development or production database.
"""

import asyncio
import os
import subprocess
import sys
import tempfile
from pathlib import Path

HOST, PORT = "localhost", 55432
DB_NAME = "srm_approval_e2e"
API_PORT = os.environ.get("E2E_API_PORT", "5001")
FRONTEND_PORT = os.environ.get("E2E_FRONTEND_PORT", "5174")

BACKEND_DIR = Path(os.environ.get("E2E_BACKEND_DIR") or Path(__file__).resolve().parents[3] / "backend")

DATABASE_URL = f"postgresql+asyncpg://postgres:postgres@{HOST}:{PORT}/{DB_NAME}"
assert f"@{HOST}:{PORT}/" in DATABASE_URL, "E2E must only target the disposable test Postgres"

ENV = {
    **os.environ,
    "ENVIRONMENT": "development",
    "DATABASE_URL": DATABASE_URL,
    "ACCESS_TOKEN_SECRET": "e2e-access-token-secret-please-ignore-32b",
    "REFRESH_TOKEN_SECRET": "e2e-refresh-token-secret-please-ignore-32b",
    "RESET_TOKEN_SECRET": "e2e-reset-token-secret-please-ignore-32bb",
    "ALLOW_INSECURE_COOKIES": "true",
    "ALLOWED_ORIGINS": f'["http://localhost:{FRONTEND_PORT}","http://127.0.0.1:{FRONTEND_PORT}"]',
    "EMAIL_USER": "",
    "EMAIL_PASSWORD": "",
    "STORAGE_ROOT": str(Path(tempfile.gettempdir()) / "srm_e2e_storage"),
    "LOG_DIR": str(Path(tempfile.gettempdir()) / "srm_e2e_logs"),
}


async def recreate_database() -> None:
    import asyncpg

    conn = await asyncpg.connect(host=HOST, port=PORT, user="postgres", password="postgres", database="postgres")
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{DB_NAME}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{DB_NAME}"')
    finally:
        await conn.close()


def run(*args: str) -> None:
    subprocess.run([sys.executable, *args], cwd=BACKEND_DIR, env=ENV, check=True)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(recreate_database())
    run("-m", "alembic", "upgrade", "head")
    run("-m", "app.scripts.seed_users")
    print(f"E2E backend ready on :{API_PORT}", flush=True)

    # Serve in-process so the global per-IP API limiter (300 req/min) can be
    # lifted for the suite: every Playwright worker shares one IP and would
    # otherwise trip it. Only this harness is affected - app code is untouched,
    # and the login (failed-attempt) limiter is left at its real value.
    os.environ.update({k: v for k, v in ENV.items() if k in ("DATABASE_URL", "ENVIRONMENT") or k.endswith(("_SECRET", "_COOKIES", "_ORIGINS", "_ROOT", "_DIR", "_USER", "_PASSWORD"))})
    os.chdir(BACKEND_DIR)
    sys.path.insert(0, str(BACKEND_DIR))
    from app.core import rate_limit

    rate_limit.api_limiter.limit = 1_000_000

    import uvicorn

    uvicorn.run("app.main:app", port=int(API_PORT), log_level="warning")
