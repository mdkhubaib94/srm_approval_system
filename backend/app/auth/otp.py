"""In-memory OTP cache with expiration. Direct port of src/utils/otpCache.js.

Structure: {email: {otp, expires_at, attempts, created_at}}

NOTE: this is per-process, same as the source — running more than one
backend instance requires moving this to a shared store (Redis, or a
Postgres table with its own TTL sweep). Fine to keep in-memory for now: the
OTP cache is short-lived (~10 min) and the source app itself is single
process.
"""

import hmac
import secrets
import time
from dataclasses import dataclass, field

OTP_EXPIRY_SECONDS = 10 * 60
MAX_ATTEMPTS = 5
RESEND_COOLDOWN_SECONDS = 60


@dataclass
class _OtpRecord:
    otp: str
    expires_at: float
    created_at: float
    attempts: int = 0


@dataclass
class OtpResult:
    valid: bool
    message: str


@dataclass
class ThrottleResult:
    allowed: bool
    retry_after_seconds: int | None = None


_otp_store: dict[str, _OtpRecord] = {}


def generate_otp() -> str:
    """A 6-digit OTP using a cryptographically secure RNG."""
    return str(secrets.randbelow(900000) + 100000)


def store_otp(email: str, otp: str) -> None:
    now = time.time()
    _otp_store[email.lower()] = _OtpRecord(otp=otp, expires_at=now + OTP_EXPIRY_SECONDS, created_at=now)


def verify_otp(email: str, otp: str) -> OtpResult:
    key = email.lower()
    record = _otp_store.get(key)

    if record is None:
        return OtpResult(False, "OTP not found or expired. Please request a new one.")

    now = time.time()
    if now > record.expires_at:
        del _otp_store[key]
        return OtpResult(False, "OTP has expired. Please request a new one.")

    if record.attempts >= MAX_ATTEMPTS:
        del _otp_store[key]
        return OtpResult(False, "Maximum verification attempts exceeded. Please request a new OTP.")

    record.attempts += 1

    matches = hmac.compare_digest(str(otp), record.otp)
    if not matches:
        remaining = MAX_ATTEMPTS - record.attempts
        plural = "s" if remaining != 1 else ""
        return OtpResult(False, f"Invalid OTP. {remaining} attempt{plural} remaining.")

    # Valid OTP - delete it (one-time use)
    del _otp_store[key]
    return OtpResult(True, "OTP verified successfully.")


def has_valid_otp(email: str) -> bool:
    key = email.lower()
    record = _otp_store.get(key)
    if record is None:
        return False
    if time.time() > record.expires_at:
        del _otp_store[key]
        return False
    return True


def can_send_otp(email: str) -> ThrottleResult:
    """Applies to both send and resend, so resend cannot bypass the
    throttle or reset the attempt counter at will."""
    key = email.lower()
    record = _otp_store.get(key)
    now = time.time()
    if record is None or now > record.expires_at:
        return ThrottleResult(True)

    elapsed = now - record.created_at
    if elapsed < RESEND_COOLDOWN_SECONDS:
        return ThrottleResult(False, retry_after_seconds=int((RESEND_COOLDOWN_SECONDS - elapsed) + 0.999))
    return ThrottleResult(True)


def delete_otp(email: str) -> None:
    _otp_store.pop(email.lower(), None)


def cleanup_expired() -> None:
    now = time.time()
    for email, record in list(_otp_store.items()):
        if now > record.expires_at:
            del _otp_store[email]
