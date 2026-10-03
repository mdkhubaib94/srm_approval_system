import asyncio
import os
import sys

# asyncpg's connection cancellation path (Connection._cancel) schedules a task
# on the running loop; Windows' default ProactorEventLoopPolicy intermittently
# hands that task to a *different* loop than the one asyncpg's protocol was
# created on ("Task ... got Future ... attached to a different loop"), which
# only surfaces under pytest-asyncio's loop bookkeeping. SelectorEventLoop
# does not have this failure mode and is what asyncpg's own test suite uses
# on Windows. Must be set before any event loop is created.
if sys.platform == "win32":
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Point the app at the disposable Docker Compose test database *before*
# app.config.get_settings() is ever imported/cached, so a stray dev .env
# can't cause tests to run against (and mutate) a real database.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@localhost:55432/srm_approval_test",
)
# Real (if arbitrary) 32+ byte secrets — PyJWT warns on anything shorter for
# HS256, and the placeholder values in .env.example are intentionally too
# short to accidentally end up protecting anything real.
os.environ.setdefault("ACCESS_TOKEN_SECRET", "test-access-token-secret-please-ignore-32b")
os.environ.setdefault("REFRESH_TOKEN_SECRET", "test-refresh-token-secret-please-ignore-32b")

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from alembic import command
from alembic.config import Config as AlembicConfig
from app.db.base import Base, get_engine, get_sessionmaker
from app.db.session import get_db
from app.main import app

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Both async fixtures and async test bodies must share one event loop for the
# whole session (set via asyncio_default_fixture_loop_scope /
# asyncio_default_test_loop_scope in pyproject.toml): our SQLAlchemy engine
# and its asyncpg connection pool are cached at module scope (matching the
# app's real single-loop runtime), so a fresh per-test loop would try to
# reuse asyncpg connections across event loops and crash.


@pytest.fixture(scope="session", autouse=True)
def _migrate_test_database():
    """Run Alembic migrations once per test session against the test DB."""
    alembic_cfg = AlembicConfig(os.path.join(PROJECT_ROOT, "alembic.ini"))
    alembic_cfg.set_main_option("script_location", os.path.join(PROJECT_ROOT, "alembic"))
    command.upgrade(alembic_cfg, "head")
    yield
    command.downgrade(alembic_cfg, "base")


@pytest.fixture(autouse=True)
def _reset_otp_cache():
    """The OTP cache is module-level in-memory state (by design — see
    app/auth/otp.py), so it persists across tests in the same process unless
    cleared explicitly."""
    from app.auth import otp as otp_module

    otp_module._otp_store.clear()
    yield
    otp_module._otp_store.clear()


@pytest.fixture(autouse=True)
def _stub_mail_transport(monkeypatch):
    """Every test runs with no real SMTP credentials configured, so a
    genuine send would try to reach smtp.gmail.com and hang/timeout. Stub at
    the transport boundary (app.email.service.send_mail — the name as bound
    in that module's namespace, not mail_transport's) so callers still
    exercise the real template-building/dispatch code in
    app/email/service.py, just without touching the network. Tests that
    want to assert on the "sent" message inspect `sent_emails`."""
    from app.email import service as email_service_module

    sent_emails: list[dict] = []

    async def fake_send_mail(mail_options: dict) -> dict:
        sent_emails.append(mail_options)
        return {"id": f"test-message-{len(sent_emails)}"}

    monkeypatch.setattr(email_service_module, "send_mail", fake_send_mail)
    return sent_emails


@pytest.fixture(autouse=True)
def _reset_rate_limiters():
    """Same rationale as _reset_otp_cache: the rate limiter buckets are
    module-level in-memory state shared across the whole test process."""
    from app.core import rate_limit as rate_limit_module

    for limiter in (
        rate_limit_module.login_limiter,
        rate_limit_module.otp_limiter,
        rate_limit_module.api_limiter,
    ):
        limiter._buckets.clear()
    yield


@pytest.fixture
async def db_session() -> AsyncSession:
    """A per-test AsyncSession wrapped in a transaction that's always rolled back."""
    engine = get_engine()
    connection = await engine.connect()
    transaction = await connection.begin()
    sessionmaker = get_sessionmaker()
    session = sessionmaker(bind=connection, join_transaction_mode="create_savepoint")

    try:
        yield session
    finally:
        await session.close()
        await transaction.rollback()
        await connection.close()


@pytest.fixture
async def client(db_session: AsyncSession):
    """An HTTP client whose requests reuse the same per-test transactional
    session as db_session — so data created via the API is visible to
    fixture setup/assertions, and everything rolls back together at the end
    of the test."""

    async def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db
    transport = ASGITransport(app=app)
    try:
        # https, not http: our auth cookies are always marked Secure (see
        # core/security.py's cookie_secure — true by default, matching prod
        # behind TLS), and httpx's cookie jar silently refuses to store or
        # resend a Secure cookie over a plain http origin. ASGITransport
        # never touches the network either way, so this costs nothing.
        async with AsyncClient(transport=transport, base_url="https://test") as ac:
            yield ac
    finally:
        app.dependency_overrides.pop(get_db, None)
