"""Mail transport — SMTP via aiosmtplib. Direct port of
src/utils/mailTransport.js (SMTP branch only; the Brevo HTTP API fallback
that existed for hosts filtering outbound SMTP has been removed).

The app sends all mail through this module.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.config import get_settings


class MailError(Exception):
    """Shaped like a nodemailer-ish error: code/command/response_code carry
    the diagnosable detail; describe_mail_error() reads them."""

    def __init__(self, message: str, *, code: str | None = None, command: str | None = None, response_code: int | None = None, response: str | None = None):
        super().__init__(message)
        self.code = code
        self.command = command
        self.response_code = response_code
        self.response = response


def resolve_from_address() -> str:
    """The address every message is sent from.

    Most SMTP hosts (Gmail included) require the envelope sender to be the
    authenticated mailbox or one of its verified aliases, so EMAIL_USER is
    the correct default.
    """
    settings = get_settings()
    if settings.email_from:
        return settings.email_from
    if settings.email_user:
        return f"SRM-RMP Approval System <{settings.email_user}>"
    return "SRM-RMP Approval System <no-reply@localhost>"


# ─── SMTP transport ────────────────────────────────────────────────────────────


async def _send_via_smtp(message: dict) -> dict:
    import aiosmtplib

    settings = get_settings()
    to_list = message.get("to") or []
    recipients = to_list if isinstance(to_list, list) else [to_list]

    mime = MIMEMultipart("alternative")
    mime["Subject"] = message.get("subject", "")
    mime["From"] = message.get("from") or resolve_from_address()
    mime["To"] = ", ".join(recipients)
    if message.get("text"):
        mime.attach(MIMEText(message["text"], "plain"))
    if message.get("html"):
        mime.attach(MIMEText(message["html"], "html"))

    port = settings.email_port
    try:
        response = await aiosmtplib.send(
            mime,
            hostname=settings.email_host,
            port=port,
            username=settings.email_user or None,
            password=settings.email_password or None,
            # 465 = implicit TLS; 587 upgrades via STARTTLS. On the STARTTLS
            # ports, refuse to continue if the server does not offer the
            # upgrade — otherwise a fallback to plaintext would send the
            # AUTH credentials in the clear.
            use_tls=port == 465,
            start_tls=port != 465,
            timeout=30,
        )
    except aiosmtplib.SMTPAuthenticationError as cause:
        raise MailError(str(cause), code="EAUTH", command="AUTH", response_code=getattr(cause, "code", None)) from cause
    except aiosmtplib.SMTPConnectTimeoutError as cause:
        raise MailError(str(cause), code="ETIMEDOUT", command="CONNECT") from cause
    except aiosmtplib.SMTPException as cause:
        raise MailError(str(cause), code="ESMTP", command="SEND") from cause

    message_id = mime.get("Message-ID") or str(response)
    return {"id": message_id}


# ─── Error and config description ──────────────────────────────────────────────


def describe_mail_error(error: Exception) -> str:
    """Flatten a transport error into a short, log-safe descriptor. Never
    includes credentials."""
    settings = get_settings()
    source = error
    for _ in range(5):
        if isinstance(source, MailError) and source.code:
            break
        cause = getattr(source, "__cause__", None)
        if cause is None:
            break
        source = cause

    parts = ["provider=smtp"]
    code = getattr(source, "code", None)
    command = getattr(source, "command", None)
    response_code = getattr(source, "response_code", None)
    if code:
        parts.append(f"code={code}")
    if command:
        parts.append(f"command={command}")
    if response_code:
        parts.append(f"responseCode={response_code}")
    parts.append(f"host={settings.email_host}:{settings.email_port}")

    detail = getattr(source, "response", None) or str(source) or str(error) or "unknown error"
    return f"{detail} ({' '.join(parts)})"


def describe_mail_config() -> dict:
    """Which config keys resolved to a value. Booleans only — never the
    values — so this is safe to return from a diagnostics route or log."""
    settings = get_settings()
    return {
        "provider": "smtp",
        "host": settings.email_host,
        "port": settings.email_port,
        "secure": settings.email_port == 465,
        "user_set": bool(settings.email_user),
        "password_set": bool(settings.email_password),
        "from": resolve_from_address(),
    }


# ─── Public API ─────────────────────────────────────────────────────────────────


async def send_mail(mail_options: dict) -> dict:
    """Send one message and return {"id": ...}. Raises MailError on failure."""
    message = {"from": resolve_from_address(), **mail_options}
    return await _send_via_smtp(message)


async def verify_transport() -> dict:
    """Check credentials without sending anything."""
    import aiosmtplib

    settings = get_settings()
    port = settings.email_port
    try:
        client = aiosmtplib.SMTP(hostname=settings.email_host, port=port, use_tls=port == 465, timeout=15)
        await client.connect()
        if port != 465:
            await client.starttls()
        if settings.email_user:
            await client.login(settings.email_user, settings.email_password or "")
        await client.quit()
    except aiosmtplib.SMTPAuthenticationError as cause:
        raise MailError(str(cause), code="EAUTH", command="AUTH") from cause
    except aiosmtplib.SMTPException as cause:
        raise MailError(str(cause), code="ESMTP", command="CONNECT") from cause

    return {"provider": "smtp", "verified": True, "from": resolve_from_address()}
