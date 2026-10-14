"""Business logic for authentication. Reference:
src/controllers/authController.js, src/controllers/passwordResetController.js.

Every failure path raises AuthServiceError carrying the exact response body
the controller must return — auth responses don't follow the {"detail": ...}
shape HTTPException produces elsewhere in this app, so the controller
returns `exc.body` verbatim via JSONResponse instead of re-deriving it.
"""

import logging
from functools import lru_cache

import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import otp as otp_cache
from app.auth import reset_token as reset_token_module
from app.config import get_settings
from app.core.rate_limit import login_limiter
from app.core.rbac import ROLES
from app.core.security import (
    MIN_PASSWORD_LENGTH,
    burn_timing_for_missing_user,
    decode_refresh_token,
    hash_password,
    sign_access_token,
    sign_refresh_token,
    verify_password,
)
from app.email.service import send_password_reset_otp as send_password_reset_otp_email
from app.auth import repository as repo
from app.users.models import User

logger = logging.getLogger("app.auth")

GENERIC_LOGIN_FAILURE = {"message": "Invalid email/employee ID or password."}
NEUTRAL_RESET_MESSAGE = "If the email exists, an OTP has been sent."


class AuthServiceError(Exception):
    def __init__(self, status_code: int, body: dict):
        super().__init__(body.get("message"))
        self.status_code = status_code
        self.body = body


# ─── Login / refresh / logout ─────────────────────────────────────────────────


async def login(db: AsyncSession, *, credential: str, password: str, rate_limit_key: str) -> tuple[User, str, str]:
    if not credential or not password:
        raise AuthServiceError(400, {"message": "Email/Employee ID and password are required"})

    user = await repo.find_user_by_email_or_employee_id(db, credential)

    if user is None:
        # Spend comparable time so response timing doesn't leak existence either.
        burn_timing_for_missing_user()
        login_limiter.record_failure(rate_limit_key)
        raise AuthServiceError(401, GENERIC_LOGIN_FAILURE)

    # Tolerate accidental leading/trailing whitespace: try the password exactly
    # as typed first (in case it genuinely contains spaces), then trimmed.
    stripped = password.strip()
    password_ok = verify_password(password, user.password_hash) or (
        stripped != password and bool(stripped) and verify_password(stripped, user.password_hash)
    )
    if not password_ok:
        login_limiter.record_failure(rate_limit_key)
        raise AuthServiceError(401, GENERIC_LOGIN_FAILURE)

    access_token = sign_access_token(user)
    refresh_token = sign_refresh_token(user)
    return user, access_token, refresh_token


async def refresh_tokens(db: AsyncSession, refresh_token: str | None) -> tuple[User, str, str]:
    # Cookie only. Accepting the refresh token from a header would mean the
    # client had to keep a copy in JS-readable storage, within reach of XSS.
    if not refresh_token:
        raise AuthServiceError(401, {"message": "Unauthorized"})

    try:
        decoded = decode_refresh_token(refresh_token)
    except jwt.PyJWTError as err:
        logger.warning("[REFRESH] Rejected refresh cookie (%s)", type(err).__name__)
        raise AuthServiceError(401, {"message": "Unauthorized"})

    user = await repo.find_user_by_id(db, decoded["UserInfo"]["id"])
    if user is None:
        raise AuthServiceError(401, {"message": "Unauthorized"})

    # Reject tokens issued before the last logout / password reset.
    if decoded.get("tv", 0) != (user.token_version or 0):
        raise AuthServiceError(401, {"message": "Unauthorized"})

    # Rotated on every refresh, and derived only from the stored user record
    # plus the server secret — never from the incoming request.
    new_refresh_token = sign_refresh_token(user)
    new_access_token = sign_access_token(user)
    return user, new_access_token, new_refresh_token


async def revoke_refresh_token(db: AsyncSession, refresh_token: str | None) -> None:
    """Actually revoke the token rather than just dropping the cookie — a
    copy captured earlier would otherwise remain valid for the rest of its
    life. Never raises: an already-invalid token has nothing to revoke."""
    if not refresh_token:
        return
    try:
        decoded = decode_refresh_token(refresh_token)
        user = await repo.find_user_by_id(db, decoded["UserInfo"]["id"])
        if user is not None:
            user.token_version = (user.token_version or 0) + 1
            await repo.commit(db)
    except jwt.PyJWTError:
        pass


# ─── Password reset ───────────────────────────────────────────────────────────


async def dispatch_reset_otp(db: AsyncSession, email: str) -> None:
    """Same response whether or not the address exists (the caller always
    returns the neutral message on a non-exception return), so this cannot
    be used to enumerate accounts."""
    user = await repo.find_user_by_email(db, email)
    if user is None:
        return

    throttle = otp_cache.can_send_otp(email)
    if not throttle.allowed:
        raise AuthServiceError(
            429,
            {
                "success": False,
                "message": f"An OTP was already sent. Please wait {throttle.retry_after_seconds}s before requesting another.",
            },
        )

    code = otp_cache.generate_otp()
    otp_cache.store_otp(email, code)

    try:
        await send_password_reset_otp_email(user.email, code, user.name)
    except Exception:
        logger.exception("[FORGOT PASSWORD] Email sending failed")
        raise AuthServiceError(500, {"success": False, "message": "Failed to send OTP email. Please try again later."})


async def verify_reset_otp(db: AsyncSession, *, email: str, otp: str) -> tuple[User, str]:
    user = await repo.find_user_by_email(db, email)

    # Don't distinguish "no such user" from "wrong OTP".
    invalid = {"success": False, "message": "Invalid or expired OTP. Please request a new one."}
    if user is None:
        raise AuthServiceError(400, invalid)

    verification = otp_cache.verify_otp(email, otp)
    if not verification.valid:
        raise AuthServiceError(400, {"success": False, "message": verification.message})

    # Signed, expiring, bound to this user's current password hash — so it
    # cannot be forged and cannot be replayed once the password changes.
    reset_token = reset_token_module.issue_reset_token(user)
    return user, reset_token


async def reset_password(db: AsyncSession, *, token: str | None, email: str, new_password: str) -> None:
    if len(new_password) < MIN_PASSWORD_LENGTH:
        raise AuthServiceError(400, {"success": False, "message": f"Password must be at least {MIN_PASSWORD_LENGTH} characters long"})

    if not token:
        raise AuthServiceError(401, {"success": False, "message": "Reset token missing. Please verify OTP again."})

    user = await repo.find_user_by_email(db, email)
    verification = reset_token_module.verify_reset_token(token, user)
    if not verification.valid:
        raise AuthServiceError(401, {"success": False, "message": verification.message})

    user.password_hash = hash_password(new_password)
    # Invalidate every session issued before the password changed.
    user.token_version = (user.token_version or 0) + 1
    await repo.commit(db)
