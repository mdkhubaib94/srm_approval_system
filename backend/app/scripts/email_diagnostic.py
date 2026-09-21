"""Diagnose the configured email transport. Direct port of
src/scripts/testEmail.js.

  python -m app.scripts.email_diagnostic                     # config + connection check only
  python -m app.scripts.email_diagnostic you@example.com      # also send a real test message there

Exercises the same transport (app/email/mail_transport.py) the app uses, so
a pass here means the app can send too.
"""

import asyncio
import sys
from datetime import datetime, timezone

from app.email.mail_transport import (
    MailError,
    describe_mail_config,
    describe_mail_error,
    resolve_from_address,
    send_mail,
    verify_transport,
)


def _show(label: str, value) -> None:
    print(f"   {label:<18} {value}")


async def run() -> None:
    recipient = sys.argv[1] if len(sys.argv) > 1 else None

    print("\n=== Email Configuration Test ===\n")

    config = describe_mail_config()
    print("1. Resolved configuration")
    _show("provider", config["provider"])
    _show("from", resolve_from_address())
    for key, value in config.items():
        if key in ("provider", "from"):
            continue
        _show(key, value)

    print("\n2. Verifying transport...")
    try:
        result = await verify_transport()
        print(f"   OK {config['provider']} transport ready (verified: {result['verified']})")
    except MailError as error:
        print(f"\n   FAILED Transport check failed: {describe_mail_error(error)}")
        if error.code == "EAUTH":
            print("\n   Authentication was rejected. For Gmail, use a 16-character App Password.")
        elif error.code in ("ESMTP", "ETIMEDOUT"):
            print("\n   Could not reach the SMTP host - check the host/port and any firewall.")
        sys.exit(1)

    if not recipient:
        print("\n3. Send test - skipped (pass an address to send one)")
        print("\n   e.g. python -m app.scripts.email_diagnostic someone@example.com\n")
        print("=== Configuration looks valid ===\n")
        return

    print(f"\n3. Sending test message to {recipient}...")
    try:
        result = await send_mail(
            {
                "to": [recipient],
                "subject": "Test Email - SRM-RMP Approval System",
                "text": "This is a test from the SRM-RMP Approval System. If you received it, email delivery is working.",
                "html": (
                    "<h2>Email configuration test successful</h2>"
                    "<p>This is a test from the <strong>SRM-RMP Approval System</strong>.</p>"
                    f"<p>From: <code>{resolve_from_address()}</code></p>"
                    f"<hr><p style='color:#666;font-size:12px;'>Sent at {datetime.now(timezone.utc).isoformat()}</p>"
                ),
            }
        )
        print(f"   OK Accepted - message id {result['id']}")
        print(f"\nCheck the inbox at {recipient}\n")
        print("=== All checks passed ===\n")
    except MailError as error:
        print(f"\n   FAILED Send failed: {describe_mail_error(error)}\n")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(run())
