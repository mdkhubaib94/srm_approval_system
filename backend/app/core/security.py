"""Password hashing, JWT signing/verification, and cookie-security helpers.

Ports of src/utils (bcrypt via authController.js, jsonwebtoken via
authController.js, cookieSecurity.js). Keep the two JWT secrets distinct —
that separation is what stops a leaked access-token secret from also being
usable to forge refresh tokens.
"""

import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Literal

import bcrypt
import jwt
from starlette.requests import Request

from app.config import get_settings

SALT_ROUNDS = 10
MIN_PASSWORD_LENGTH = 8


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(SALT_ROUNDS)).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


# A throwaway bcrypt digest, hashed once per process start from random bytes,
# used only to burn comparable CPU when a login's email has no account so
# response timing cannot be used to enumerate users. See authController.js's
# TIMING_DUMMY_HASH for the full rationale.
TIMING_DUMMY_HASH = bcrypt.hashpw(secrets.token_hex(32).encode("utf-8"), bcrypt.gensalt(SALT_ROUNDS)).decode(
    "utf-8"
)


def burn_timing_for_missing_user() -> None:
    bcrypt.checkpw(secrets.token_hex(16).encode("utf-8"), TIMING_DUMMY_HASH.encode("utf-8"))


# ─── JWT ──────────────────────────────────────────────────────────────────────


def user_info_for(user) -> dict[str, Any]:
    return {
        "id": user.id,
        "name": user.name,
        "role": user.role,
        "institution": user.institution,
        "department": user.department,
    }


def sign_access_token(user) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    payload = {
        "UserInfo": user_info_for(user),
        "iat": now,
        "exp": now + timedelta(minutes=settings.access_token_expires_minutes),
    }
    return jwt.encode(payload, settings.access_token_secret, algorithm="HS256")


def sign_refresh_token(user) -> str:
    """tv pins the token to the user's current token_version so logout /
    password reset can invalidate it. Expiry mirrors the cookie policy: ~10
    years (until manual logout) for CHAIRMAN, 1 day for everyone else.

    jti makes each issuance unique even when two tokens are signed for the
    same user within the same second (e.g. login immediately followed by a
    refresh) — without it, an identical payload produces an identical
    signature, so "rotated" would be observably false right when it matters
    most for detecting stolen-token reuse.
    """
    settings = get_settings()
    now = datetime.now(timezone.utc)
    days = (
        settings.refresh_token_expires_days_chairman
        if user.role == "CHAIRMAN"
        else settings.refresh_token_expires_days_default
    )
    payload = {
        "UserInfo": user_info_for(user),
        "tv": user.token_version or 0,
        "jti": secrets.token_hex(8),
        "iat": now,
        "exp": now + timedelta(days=days),
    }
    return jwt.encode(payload, settings.refresh_token_secret, algorithm="HS256")


def decode_access_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.access_token_secret, algorithms=["HS256"])


def decode_refresh_token(token: str) -> dict[str, Any]:
    settings = get_settings()
    return jwt.decode(token, settings.refresh_token_secret, algorithms=["HS256"])


# ─── Cookie security ──────────────────────────────────────────────────────────


def cookie_secure(request: Request | None) -> bool:
    """The `Secure` decision for auth cookies, in one place so the refresh
    cookie and the password-reset cookie cannot drift apart.

    Defaults to True always; only False when ALLOW_INSECURE_COOKIES=true is
    set, which exists solely so plain-http localhost development still works.
    Deliberately not derived from NODE_ENV-equivalent or request.url.scheme
    alone — see cookieSecurity.js for why both of those fail open.
    """
    if get_settings().allow_insecure_cookies:
        return bool(request is not None and request.url.scheme == "https")
    return True


# Chairman stays signed in across browser/tab close and machine restarts until
# they log out manually. Browsers clamp cookie lifetimes (Chrome: 400 days), but
# the cookie is re-issued on every refresh, so the window keeps sliding forward.
CHAIRMAN_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60


def refresh_cookie_kwargs(request: Request | None, user) -> dict[str, Any]:
    """kwargs for Response.set_cookie(...) for the `jwt` refresh cookie.

    Chairman gets a long-lived persistent cookie; everyone else gets a session
    cookie (max_age omitted) that the browser discards on close.
    """
    kwargs: dict[str, Any] = {
        "httponly": True,
        "secure": cookie_secure(request),
        "samesite": "lax",
        "path": "/",
    }
    if user is not None and user.role == "CHAIRMAN":
        kwargs["max_age"] = CHAIRMAN_COOKIE_MAX_AGE_SECONDS
    return kwargs


RESET_COOKIE_MAX_AGE_SECONDS = 10 * 60


def reset_cookie_kwargs(request: Request | None) -> dict[str, Any]:
    return {
        "httponly": True,
        "secure": cookie_secure(request),
        "samesite": "strict",
        "path": "/",
        "max_age": RESET_COOKIE_MAX_AGE_SECONDS,
    }
