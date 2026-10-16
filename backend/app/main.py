import asyncio
from contextlib import asynccontextmanager
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from app.auth.controller import router as auth_router
from app.completed.controller import router as completed_router
from app.config import get_settings
from app.db.base import get_engine
from app.files.controller import router as files_router
from app.flagged.controller import router as flagged_router
from app.form_configs.controller import router as form_configs_router
from app.logging_config import configure_logging
from app.middleware.camel_case import CamelCaseResponseMiddleware
from app.middleware.global_rate_limit import GlobalRateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.middleware.trusted_proxy import TrustedProxyMiddleware
from app.policies.controller import router as policies_router
from app.queries.controller import router as queries_router
from app.requests.controller import router as requests_router
from app.sops.controller import router as sops_router
from app.sops.embedding_service import bootstrap_model
from app.sops.index_service import reindex_after_model_ready
from app.tasks.scheduler import shutdown_scheduler, start_scheduler
from app.users.controller import router as users_router

settings = get_settings()
configure_logging(settings)


def _run_migrations() -> None:
    backend_dir = Path(__file__).resolve().parent.parent
    alembic_cfg = AlembicConfig(str(backend_dir / "alembic.ini"))
    command.upgrade(alembic_cfg, "head")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Apply pending schema changes before serving traffic or starting jobs.
    # Alembic's async environment owns its event loop, so run it in a thread.
    await asyncio.to_thread(_run_migrations)
    # Set up the local AI model in the background (downloads it on first run,
    # retries until available) and then index every SOP that needs it. Never
    # blocks startup, so the rest of the app is usable immediately.
    model_task = asyncio.create_task(bootstrap_model(on_ready=reindex_after_model_ready))
    start_scheduler()
    yield
    model_task.cancel()
    shutdown_scheduler()


_is_production = settings.environment == "production"

app = FastAPI(
    title="SRM Approval System API",
    lifespan=lifespan,
    docs_url=None if _is_production else "/docs",
    redoc_url=None if _is_production else "/redoc",
    openapi_url=None if _is_production else "/openapi.json",
)

# ─── Middleware ─────────────────────────────────────────────────────────────
# Starlette executes the LAST-added middleware outermost, so this list is
# written innermost-first, i.e. add_middleware() is called in the reverse of
# request-processing order. Final order (outer to inner):
#   TrustedProxy -> SecurityHeaders -> CORS -> GlobalRateLimit -> CamelCase -> routes
#
# TrustedProxy must be outermost so every downstream layer (in particular
# GlobalRateLimit and the per-route limiters, which key off request.client)
# sees the real client IP rather than the proxy's. Rate limiting sits inside
# CORS so a browser preflight (OPTIONS, handled by CORSMiddleware itself) is
# never itself rate-limited or blocked. Security headers wrap everything so
# they land on error responses too, not just successful ones. CamelCase sits
# innermost, right against the routes, so it rewrites every route's own JSON
# body without needing to also handle the other middlewares' short-circuit
# responses (rate-limit 429s, etc. — their bodies don't need it anyway).

app.add_middleware(CamelCaseResponseMiddleware)
app.add_middleware(GlobalRateLimitMiddleware)

# credentials=True is required for the jwt/resetToken auth cookies to be sent
# cross-origin between the deployed frontend and this API. Port of
# corsOptions.js/allowedOrigins.js.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(TrustedProxyMiddleware)

# ─── Routes ─────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(users_router)
app.include_router(requests_router)
app.include_router(policies_router)
app.include_router(queries_router)
app.include_router(completed_router)
app.include_router(flagged_router)
app.include_router(files_router)
app.include_router(sops_router)
app.include_router(form_configs_router)


@app.get("/")
async def root() -> str:
    return "Server is running!"


@app.get("/ping")
async def ping() -> str:
    return "Server is awake"


@app.get("/health")
async def health() -> dict:
    engine = get_engine()
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "ok"}
