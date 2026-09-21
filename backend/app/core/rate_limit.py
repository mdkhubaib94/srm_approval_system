"""In-memory sliding-window rate limiting.

Direct behavioral port of the express-rate-limit tiers in
middleware/rateLimiters.js: keyed by client IP, in-memory/per-process (same
as the source, which never ran more than one instance — move to a shared
store such as Redis before horizontally scaling this API).
"""

import time
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import HTTPException, Request, status


@dataclass
class _Bucket:
    hits: list[float] = field(default_factory=list)


class RateLimiter:
    def __init__(self, window_seconds: int, limit: int, message: str):
        self.window_seconds = window_seconds
        self.limit = limit
        self.message = message
        self._buckets: dict[str, _Bucket] = defaultdict(_Bucket)

    @staticmethod
    def _client_key(request: Request) -> str:
        return request.client.host if request.client else "unknown"

    def _prune(self, bucket: _Bucket, now: float) -> None:
        cutoff = now - self.window_seconds
        bucket.hits = [t for t in bucket.hits if t > cutoff]

    def _raise_if_blocked(self, bucket: _Bucket) -> None:
        if len(bucket.hits) >= self.limit:
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=self.message)

    def check(self, request: Request) -> str:
        """Record this hit unconditionally and raise 429 if already over the
        limit. Use for limiters that count every request (otp, register)."""
        key = self._client_key(request)
        bucket = self._buckets[key]
        now = time.time()
        self._prune(bucket, now)
        self._raise_if_blocked(bucket)
        bucket.hits.append(now)
        return key

    def check_without_recording(self, request: Request) -> str:
        """For limiters that skip successful requests (login): check only —
        the caller records a hit explicitly via record_failure() once the
        outcome (success/failure) is known."""
        key = self._client_key(request)
        bucket = self._buckets[key]
        now = time.time()
        self._prune(bucket, now)
        self._raise_if_blocked(bucket)
        return key

    def record_failure(self, key: str) -> None:
        self._buckets[key].hits.append(time.time())


# Credential-guessing surface: login. Only failed attempts count.
login_limiter = RateLimiter(15 * 60, 10, "Too many login attempts. Please try again in 15 minutes.")
# Anything that sends an email or checks an OTP.
otp_limiter = RateLimiter(15 * 60, 8, "Too many attempts. Please try again in 15 minutes.")
# Account creation.
register_limiter = RateLimiter(60 * 60, 10, "Too many registration attempts. Please try again later.")
# Broad backstop for the rest of the API (wired globally in Phase 9).
api_limiter = RateLimiter(60, 300, "Too many requests. Please slow down.")


def otp_rate_limit(request: Request) -> None:
    otp_limiter.check(request)


def register_rate_limit(request: Request) -> None:
    register_limiter.check(request)


def login_rate_limit_precheck(request: Request) -> str:
    """FastAPI dependency: raises 429 if already blocked, otherwise returns
    the bucket key so the login handler can record a failure explicitly."""
    return login_limiter.check_without_recording(request)
