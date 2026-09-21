"""Password-reset tokens. Direct port of src/utils/resetToken.js.

Signed JWTs, never plain encodings. Single use is enforced without
server-side state by binding the token to a fingerprint of the password hash
it was issued against: once the password changes, the fingerprint no longer
matches and the token is dead. Survives restarts and works across multiple
instances.
"""

import hashlib
from dataclasses import dataclass

import jwt

from app.config import get_settings

RESET_TOKEN_TTL_SECONDS = 10 * 60
RESET_AUDIENCE = "password-reset"


def _get_secret() -> str:
    settings = get_settings()
    return settings.reset_token_secret or settings.access_token_secret


def _fingerprint(password_hash: str) -> str:
    return hashlib.sha256(str(password_hash).encode("utf-8")).hexdigest()[:32]


def issue_reset_token(user) -> str:
    import time

    now = int(time.time())
    payload = {
        "sub": str(user.id),
        "pwf": _fingerprint(user.password_hash),
        "aud": RESET_AUDIENCE,
        "iat": now,
        "exp": now + RESET_TOKEN_TTL_SECONDS,
    }
    return jwt.encode(payload, _get_secret(), algorithm="HS256")


@dataclass
class ResetTokenResult:
    valid: bool
    user_id: str | None = None
    message: str | None = None


def verify_reset_token(token: str, user) -> ResetTokenResult:
    try:
        payload = jwt.decode(token, _get_secret(), algorithms=["HS256"], audience=RESET_AUDIENCE)
    except jwt.ExpiredSignatureError:
        return ResetTokenResult(False, message="Reset link has expired. Please request a new OTP.")
    except jwt.PyJWTError:
        return ResetTokenResult(False, message="Invalid reset token. Please request a new OTP.")

    if user is None or str(user.id) != payload.get("sub"):
        return ResetTokenResult(False, message="Invalid reset token. Please request a new OTP.")

    # Already used (password changed since the token was issued).
    if payload.get("pwf") != _fingerprint(user.password_hash):
        return ResetTokenResult(False, message="This reset token has already been used.")

    return ResetTokenResult(True, user_id=payload["sub"])
