from functools import lru_cache
from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_DEFAULT_ACCESS_SECRET = "change-me-access"
_DEFAULT_REFRESH_SECRET = "change-me-refresh"


class Settings(BaseSettings):
    """Central app configuration, loaded from environment variables / .env."""

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # Deployment environment. Gates things that must never ship enabled in
    # production (API docs, default JWT secrets) but are convenient in dev.
    environment: Literal["development", "production"] = "development"

    # Logging
    log_level: str = "INFO"
    log_dir: str = "./logs"

    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/srm_approval"

    # JWT
    access_token_secret: str = _DEFAULT_ACCESS_SECRET
    refresh_token_secret: str = _DEFAULT_REFRESH_SECRET
    reset_token_secret: str | None = None
    access_token_expires_minutes: int = 30
    refresh_token_expires_days_default: int = 1
    # Effectively "until manual logout": rotated on every refresh, so it only
    # lapses if the Chairman does not open the app for this long.
    refresh_token_expires_days_chairman: int = 3650

    @model_validator(mode="after")
    def _forbid_default_secrets_in_production(self) -> "Settings":
        if self.environment == "production" and (
            self.access_token_secret == _DEFAULT_ACCESS_SECRET
            or self.refresh_token_secret == _DEFAULT_REFRESH_SECRET
        ):
            raise ValueError(
                "ACCESS_TOKEN_SECRET/REFRESH_TOKEN_SECRET must be overridden "
                "when ENVIRONMENT=production (generate real values with "
                "`openssl rand -hex 64`)."
            )
        return self

    # Cookies
    allow_insecure_cookies: bool = False

    # Reverse-proxy trust. Empty by default (no proxy headers are trusted,
    # so rate limiting/IP logging use the raw TCP peer, same as an
    # unconfigured Express app). Behind a platform edge proxy (Render,
    # Vercel, nginx, ...) that the app is not otherwise reachable around,
    # set this to ["*"] — or to the proxy's specific IP(s)/CIDR(s) — so
    # X-Forwarded-For is honored for the real client IP. Mirrors Express's
    # `app.set("trust proxy", ...)`.
    trusted_proxy_ips: list[str] = []

    # CORS. 127.0.0.1 is listed alongside localhost because they are
    # *different* origins to the browser.
    allowed_origins: list[str] = [
        "http://localhost:3000",
        "http://localhost:5000",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5000",
    ]

    # Email
    email_user: str | None = None
    email_password: str | None = None
    email_from: str | None = None
    email_host: str = "smtp.gmail.com"
    email_port: int = 465
    email_debug: bool = False
    email_diag_token: str | None = None
    frontend_url: str = "http://localhost:3000"

    # Self-signup
    self_signup_roles: list[str] = ["REQUESTER"]

    # File storage
    storage_root: str = "./storage"

    # SOP search
    embedding_model: str = "BAAI/bge-small-en-v1.5"
    # Persistent on-disk cache for the embedding model weights. Empty = a
    # folder inside storage_root (already persistent and writable by the
    # service, so no extra setup is needed). Relative paths resolve against
    # the backend directory.
    embedding_cache_dir: str = ""
    sop_match_threshold: float = 0.45


@lru_cache
def get_settings() -> Settings:
    return Settings()
