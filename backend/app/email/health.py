"""Email transport diagnostics. Direct port of
src/controllers/emailHealthController.js.

GET /auth/email-health?token=<EMAIL_DIAG_TOKEN> — runs the same handshake
the app's sends use and reports the outcome, so a deployment can be checked
without log access. Sends no mail and returns no credentials: only which
config keys resolved to a value, plus the transport's own error code on
failure. Disabled (404, not just unauthorized) unless EMAIL_DIAG_TOKEN is
set and the supplied token matches it — without that gate this would be an
unauthenticated way to make the server open outbound connections on demand.
"""

import asyncio
import hashlib
import hmac
import time

from .mail_transport import MailError, describe_mail_config, describe_mail_error, verify_transport

CONTROL_HOST = "www.google.com"
PROBE_TIMEOUT_SECONDS = 6.0


def token_matches(supplied: str, expected: str) -> bool:
    """Constant-time compare so the token cannot be recovered a character at
    a time from response timings. Hash both sides first so mismatched
    lengths don't short-circuit compare_digest either."""
    digest = lambda value: hashlib.sha256(str(value).encode("utf-8")).digest()  # noqa: E731
    return hmac.compare_digest(digest(supplied), digest(expected))


async def _probe(host: str, port: int, timeout: float = PROBE_TIMEOUT_SECONDS) -> dict:
    started = time.monotonic()
    try:
        _, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=timeout)
        writer.close()
        try:
            await writer.wait_closed()
        except Exception:
            pass
        return {"port": port, "address": host, "ms": round((time.monotonic() - started) * 1000), "reachable": True}
    except TimeoutError:
        return {"port": port, "address": host, "ms": round((time.monotonic() - started) * 1000), "reachable": False, "error": "timeout"}
    except OSError as err:
        return {"port": port, "address": host, "ms": round((time.monotonic() - started) * 1000), "reachable": False, "error": err.strerror or str(err)}


async def _resolve_v4(host: str) -> str | None:
    loop = asyncio.get_event_loop()
    try:
        infos = await loop.getaddrinfo(host, None, family=0)
        for family, _, _, _, sockaddr in infos:
            if family == 2:  # AF_INET
                return sockaddr[0]
        return infos[0][4][0] if infos else None
    except OSError:
        return None


async def probe_egress() -> dict:
    """Probe SMTP egress, plus one control host that genuinely listens on
    443 — so a failure there means egress is broken in general, and the
    target-specific results below prove nothing on their own."""
    config = describe_mail_config()
    target = config["host"]

    resolved = await _resolve_v4(target)
    if resolved is None:
        return {"target": target, "resolved": None, "resolve_error": "ENOTFOUND", "probes": []}

    ports = sorted({config["port"], 465, 587})
    probes = [await _probe(resolved, port) for port in ports]

    control_ip = await _resolve_v4(CONTROL_HOST)
    if control_ip:
        control = await _probe(control_ip, 443)
    else:
        control = {"port": 443, "reachable": False, "error": "ENOTFOUND"}
    control["control"] = True
    control["host"] = CONTROL_HOST
    probes.append(control)

    return {"target": target, "resolved": resolved, "probes": probes}


async def check_email_health(supplied_token: str | None, expected_token: str | None) -> tuple[int, dict]:
    """Returns (status_code, body). Mirrors emailHealthController.js exactly,
    including its 404-not-403 disclosure discipline when disabled/unauthorized."""
    if not expected_token:
        return 404, {"success": False, "message": "Not found."}

    if not isinstance(supplied_token, str) or not token_matches(supplied_token, expected_token):
        return 404, {"success": False, "message": "Not found."}

    config = describe_mail_config()

    if not config["user_set"] or not config["password_set"]:
        return 503, {
            "success": False,
            "stage": "config",
            "message": "EMAIL_USER and/or EMAIL_PASSWORD are not set in this environment.",
            "config": config,
        }

    try:
        await verify_transport()
        return 200, {
            "success": True,
            "stage": "verified",
            "message": "SMTP host accepted the credentials. Sending should work.",
            "config": config,
        }
    except MailError as error:
        egress = await probe_egress()
        detail = describe_mail_error(error)

        target_ports = [p for p in egress["probes"] if not p.get("control")]
        control_ok = any(p.get("control") and p.get("reachable") for p in egress["probes"])
        all_targets_blocked = bool(target_ports) and all(not p.get("reachable") for p in target_ports)

        diagnosis = "See egress.probes for which ports are reachable."
        if control_ok and all_targets_blocked:
            diagnosis = (
                "Outbound SMTP is filtered by the host: port 443 to a control host connects "
                "while every SMTP port times out."
            )
        elif not control_ok:
            diagnosis = "The control connection to port 443 also failed, so outbound egress is broken in general."

        return 503, {"success": False, "stage": "connect", "message": detail, "config": config, "egress": egress, "diagnosis": diagnosis}
