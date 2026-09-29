"""Email sending. Direct port of src/utils/emailService.js's templates,
dispatched through mail_transport.py's dual Brevo/SMTP provider.

Every function here is fire-and-forget from its caller's point of view: a
failure raises (so `dispatch`'s caller can log it), but nothing here ever
lets an email failure abort the request/job that triggered it — every call
site in auth/requests/tasks already wraps these in try/except.
"""

import logging
from datetime import datetime, timezone

from .mail_transport import MailError, describe_mail_error, resolve_from_address, send_mail

logger = logging.getLogger("app.email")

_YEAR = datetime.now(timezone.utc).year


def _frontend_url() -> str:
    from app.config import get_settings

    return get_settings().frontend_url


async def _dispatch(mail_options: dict, *, label: str, recipient: str) -> dict:
    try:
        data = await send_mail(mail_options)
        logger.info("[EMAIL] %s sent to %s: %s", label, recipient, data["id"])
        return data
    except MailError as error:
        logger.error("[EMAIL ERROR] Failed to send %s: %s", label, describe_mail_error(error))
        raise Exception("Failed to send email. Please try again later.") from error


# ─── Shared HTML shell ──────────────────────────────────────────────────────────

_BASE_STYLE = (
    "margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "
    "'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f3f4f6;"
)


def _shell(*, header_gradient: str, header_title: str, body_html: str, recipient_email: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{header_title}</title>
</head>
<body style="{_BASE_STYLE}">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td align="center" style="padding: 40px 0;">
        <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center; background: {header_gradient}; border-radius: 8px 8px 0 0;">
              <h1 style="margin: 0; color: #ffffff; font-size: 28px; font-weight: 700;">{header_title}</h1>
            </td>
          </tr>
          <tr>
            <td style="padding: 40px;">
              {body_html}
            </td>
          </tr>
          <tr>
            <td style="padding: 30px 40px; background-color: #f9fafb; border-radius: 0 0 8px 8px; text-align: center;">
              <p style="margin: 0; color: #6b7280; font-size: 14px;">&copy; {_YEAR} SRM-RMP Approval System. All rights reserved.</p>
              <p style="margin: 10px 0 0; color: #9ca3af; font-size: 12px;">This email was sent to {recipient_email}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>"""


def _otp_box(otp: str) -> str:
    return f"""
<table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0;">
  <tr>
    <td align="center" style="padding: 30px; background-color: #f9fafb; border-radius: 8px; border: 2px dashed #d1d5db;">
      <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #2563eb; font-family: 'Courier New', monospace;">{otp}</div>
      <p style="margin: 10px 0 0; color: #6b7280; font-size: 14px;">This code expires in <strong>10 minutes</strong></p>
    </td>
  </tr>
</table>"""


def _detail_row(label: str, value, *, color: str = "#111827", weight: str = "600") -> str:
    if value is None or value == "":
        return ""
    return f"""<tr>
    <td style="padding: 8px 0; color: #6b7280; font-size: 14px; width: 40%;">{label}:</td>
    <td style="padding: 8px 0; color: {color}; font-size: 14px; font-weight: {weight};">{value}</td>
  </tr>"""


def _details_box(rows: list[str]) -> str:
    return f"""
<table role="presentation" style="width: 100%; border-collapse: collapse; margin: 30px 0; background-color: #f9fafb; border-radius: 8px; overflow: hidden;">
  <tr><td style="padding: 20px;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      {''.join(rows)}
    </table>
  </td></tr>
</table>"""


def _cta_button(url: str, label: str, *, color: str = "#2563eb") -> str:
    return f"""
<table role="presentation" style="width: 100%; margin: 30px 0;">
  <tr><td align="center">
    <a href="{url}" style="display: inline-block; padding: 14px 32px; background-color: {color}; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">{label}</a>
  </td></tr>
</table>"""


# ─── Signup / password-reset OTP ────────────────────────────────────────────────


async def send_password_reset_otp(email: str, otp: str, name: str = "User") -> dict:
    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Password Reset Request</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Hello <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">We received a request to reset your password. Use the following OTP code to proceed:</p>
{_otp_box(otp)}
<div style="padding: 16px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; margin: 20px 0;">
  <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;"><strong>Security Notice:</strong> If you didn't request this password reset, please ignore this email or contact support immediately.</p>
</div>
<p style="margin: 20px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">This is an automated email, please do not reply.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", header_title="SRM-RMP Approval System", body_html=body_html, recipient_email=email)
    text = (
        f"Password Reset OTP - SRM-RMP Approval System\n\nHello {name},\n\n"
        f"We received a request to reset your password. Use the following OTP code to proceed:\n\nOTP: {otp}\n\n"
        "This code expires in 10 minutes.\n\nSecurity Notice: If you didn't request this password reset, please ignore this email.\n\n"
        f"© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": "Password Reset OTP - SRM-RMP Approval System", "html": html, "text": text}, label="Password reset OTP", recipient=email)


# ─── Request workflow notifications ─────────────────────────────────────────────


async def send_request_notification(email: str, name: str, request_data: dict, action_type: str = "forwarded") -> dict:
    request_url = f"{_frontend_url()}/requests/{request_data.get('request_id')}"

    subject_map = {
        "created": f"New Request Submitted - {request_data.get('request_id')}",
        "forwarded": f"Request Forwarded for Your Approval - {request_data.get('request_id')}",
        "queries_replied": f"Queries Replied To - Please Forward Request {request_data.get('request_id')}",
    }
    action_text_map = {
        "created": "A new request has been submitted and requires your review.",
        "forwarded": f"A request has been forwarded to you for approval at the <strong>{request_data.get('stage')}</strong> stage.",
        "queries_replied": "All queries raised on this request have been replied to. Please review the responses and forward the request to the next stage.",
    }
    subject = subject_map.get(action_type, subject_map["forwarded"])
    action_text = action_text_map.get(action_type, action_text_map["forwarded"])

    cost = request_data.get("cost")
    rows = [
        _detail_row("Request ID", request_data.get("request_id")),
        _detail_row("Title", request_data.get("title")),
        _detail_row("Institution", request_data.get("institution"), weight="400"),
        _detail_row("Department", request_data.get("department"), weight="400"),
        _detail_row("Cost", f"₹{cost}", weight="400") if cost else "",
        _detail_row("Forwarded By", request_data.get("forwarded_by"), weight="400") if request_data.get("forwarded_by") else "",
        _detail_row("Requester", request_data.get("requester_name"), weight="400") if request_data.get("requester_name") else "",
        _detail_row("Current Stage", request_data.get("stage"), color="#2563eb"),
    ]

    comments = request_data.get("comments")
    comments_html = (
        f"""<div style="padding: 16px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px; margin: 20px 0;">
  <p style="margin: 0 0 8px; color: #1e40af; font-size: 14px; font-weight: 600;">Comments:</p>
  <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.5;">{comments}</p>
</div>"""
        if comments
        else ""
    )

    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Action Required</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Hello <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">{action_text}</p>
{_details_box(rows)}
{comments_html}
{_cta_button(request_url, "View Request Details")}
<div style="padding: 16px; background-color: #fef2f2; border-left: 4px solid #dc2626; border-radius: 4px; margin: 20px 0;">
  <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;"><strong>Reminder:</strong> Please review and take action on this request within the specified timeframe to maintain service level standards.</p>
</div>
<p style="margin: 20px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">This is an automated notification. Please do not reply to this email.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)", header_title="SRM-RMP Approval System", body_html=body_html, recipient_email=email)
    text = (
        f"Request Notification - SRM-RMP Approval System\n\nHello {name},\n\n{action_text}\n\n"
        f"Request ID: {request_data.get('request_id')}\nTitle: {request_data.get('title')}\n"
        f"Institution: {request_data.get('institution')}\nDepartment: {request_data.get('department')}\n"
        f"Current Stage: {request_data.get('stage')}\n\nView Request: {request_url}\n\n© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": subject, "html": html, "text": text}, label="Request notification", recipient=email)


async def send_sla_warning_email(email: str, name: str, request_data: dict) -> dict:
    request_url = f"{_frontend_url()}/requests/{request_data.get('request_id')}"
    hours = request_data.get("working_hrs_taken")

    rows = [
        _detail_row("Request ID", request_data.get("request_id")),
        _detail_row("Title", request_data.get("title")),
        _detail_row("Institution", request_data.get("institution"), weight="400"),
        _detail_row("Department", request_data.get("department"), weight="400"),
        _detail_row("Current Stage", request_data.get("stage"), color="#f59e0b"),
        _detail_row("Pending For", f"{hours} hours", color="#dc2626"),
    ]

    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Attention Required</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Dear <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">This is a friendly reminder that a request awaiting your approval is approaching the flag deadline. The request has been pending at your stage for <strong>{hours} hours</strong> and will be flagged in approximately <strong>1 hour</strong> if no action is taken.</p>
<div style="padding: 20px; background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; margin: 30px 0;">
  <p style="margin: 0 0 12px; color: #92400e; font-size: 16px; font-weight: 600;">Time Remaining: ~1 Hour</p>
  <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">To maintain service level standards, please review and take action on this request at your earliest convenience.</p>
</div>
{_details_box(rows)}
{_cta_button(request_url, "Review Request Now", color="#f59e0b")}
<p style="margin: 20px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">We appreciate your prompt attention to this matter.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #f59e0b 0%, #d97706 100%)", header_title="Flag Reminder", body_html=body_html, recipient_email=email)
    text = (
        f"Flag Reminder - SRM-RMP Approval System\n\nDear {name},\n\n"
        f"Request {request_data.get('request_id')} has been pending at the {request_data.get('stage')} stage for {hours} hours "
        f"and will be flagged in approximately 1 hour if no action is taken.\n\nView Request: {request_url}\n\n© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": f"Flag Reminder: Request {request_data.get('request_id')} Requires Your Attention", "html": html, "text": text}, label="Flag reminder", recipient=email)


async def send_sla_flagged_email(email: str, name: str, request_data: dict) -> dict:
    request_url = f"{_frontend_url()}/requests/{request_data.get('request_id')}"
    hours = request_data.get("working_hrs_taken")

    rows = [
        _detail_row("Request ID", request_data.get("request_id")),
        _detail_row("Title", request_data.get("title")),
        _detail_row("Institution", request_data.get("institution"), weight="400"),
        _detail_row("Department", request_data.get("department"), weight="400"),
        _detail_row("Current Stage", request_data.get("stage"), color="#dc2626"),
        _detail_row("Time Elapsed", f"{hours} hours", color="#dc2626", weight="700"),
        _detail_row("Status", "FLAGGED", color="#dc2626", weight="700"),
    ]

    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Immediate Action Required</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Dear <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">A request awaiting your approval has exceeded the <strong>8-hour threshold</strong> and has been <strong>flagged</strong> for immediate attention. It has been pending at your stage for <strong>{hours} hours</strong>.</p>
<div style="padding: 20px; background-color: #fee2e2; border: 2px solid #dc2626; border-radius: 8px; margin: 30px 0;">
  <p style="margin: 0 0 12px; color: #991b1b; font-size: 18px; font-weight: 700;">FLAGGED - URGENT ACTION NEEDED</p>
  <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">This request has breached our service level agreement. Please review and take immediate action.</p>
</div>
{_details_box(rows)}
{_cta_button(request_url, "Take Immediate Action", color="#dc2626")}
<p style="margin: 20px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">We kindly request your immediate attention to this request to minimize further delays.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", header_title="Request Flagged Alert", body_html=body_html, recipient_email=email)
    text = (
        f"URGENT: Request Flagged Alert - SRM-RMP Approval System\n\nDear {name},\n\n"
        f"Request {request_data.get('request_id')} has exceeded the 8-hour threshold and has been FLAGGED. "
        f"Pending at the {request_data.get('stage')} stage for {hours} hours.\n\nView Request: {request_url}\n\n© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": f"URGENT: Request {request_data.get('request_id')} Has Been Flagged - Immediate Action Required", "html": html, "text": text}, label="Flagged notification", recipient=email)


async def send_request_approval_email(email: str, name: str, request_data: dict) -> dict:
    completion_url = f"{_frontend_url()}/completion-status/{request_data.get('completed_id')}"
    cost = request_data.get("cost")

    rows = [
        _detail_row("Request ID", request_data.get("request_id")),
        _detail_row("Title", request_data.get("title")),
        _detail_row("Institution", request_data.get("institution"), weight="400"),
        _detail_row("Department", request_data.get("department"), weight="400"),
        _detail_row("Cost", f"₹{cost}", weight="400") if cost else "",
        _detail_row("Status", "APPROVED", color="#10b981", weight="700"),
    ]

    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Congratulations!</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Hello <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Great news! Your request has been <strong>approved</strong> by the Chairman and is now ready for completion tracking.</p>
<div style="padding: 20px; background-color: #d1fae5; border: 2px solid #10b981; border-radius: 8px; margin: 30px 0;">
  <p style="margin: 0 0 12px; color: #065f46; font-size: 18px; font-weight: 700;">Approval Status: APPROVED</p>
  <p style="margin: 0; color: #065f46; font-size: 14px; line-height: 1.5;">The next step is to provide the expected completion date.</p>
</div>
{_details_box(rows)}
<div style="padding: 16px; background-color: #eff6ff; border-left: 4px solid #2563eb; border-radius: 4px; margin: 20px 0;">
  <p style="margin: 0 0 8px; color: #1e40af; font-size: 14px; font-weight: 600;">Next Steps:</p>
  <p style="margin: 0; color: #1e40af; font-size: 14px; line-height: 1.5;">Please provide the <strong>expected completion date</strong> for this request so we can track its progress.</p>
</div>
{_cta_button(completion_url, "Provide Expected Completion Date", color="#10b981")}
<p style="margin: 20px 0 0; color: #4b5563; font-size: 14px; line-height: 1.5;">Thank you for using the SRM-RMP Approval System.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #10b981 0%, #059669 100%)", header_title="Request Approved", body_html=body_html, recipient_email=email)
    text = (
        f"Request Approved - SRM-RMP Approval System\n\nHello {name},\n\n"
        f"Your request {request_data.get('request_id')} has been APPROVED by the Chairman.\n\n"
        f"Update Completion Details: {completion_url}\n\n© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": f"Request Approved - {request_data.get('request_id')}", "html": html, "text": text}, label="Request approval notification", recipient=email)


async def send_overdue_completion_email(email: str, name: str, completion_data: dict) -> dict:
    completion_url = f"{_frontend_url()}/completion-status/{completion_data.get('completed_id')}"
    expected = completion_data.get("expected_completion")
    expected_str = expected.strftime("%d %B %Y") if hasattr(expected, "strftime") else str(expected)

    rows = [
        _detail_row("Request ID", completion_data.get("request_id")),
        _detail_row("Title", completion_data.get("title")),
        _detail_row("Expected Completion", expected_str, color="#dc2626"),
    ]

    body_html = f"""
<h2 style="margin: 0 0 20px; color: #111827; font-size: 24px; font-weight: 600;">Action Required</h2>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">Dear <strong>{name}</strong>,</p>
<p style="margin: 0 0 20px; color: #4b5563; font-size: 16px; line-height: 1.5;">The expected completion date for your request has passed, but it has not yet been marked as completed. If the work is still in progress, mark it as <strong>Not Completed</strong> and provide a reason.</p>
{_details_box(rows)}
{_cta_button(completion_url, "Update Completion Status", color="#dc2626")}
<p style="margin: 20px 0 0; color: #6b7280; font-size: 13px; line-height: 1.5;">This is an automated notification. Please do not reply to this email.</p>"""

    html = _shell(header_gradient="linear-gradient(135deg, #dc2626 0%, #991b1b 100%)", header_title="Completion Overdue", body_html=body_html, recipient_email=email)
    text = (
        f"Completion Overdue - SRM-RMP Approval System\n\nDear {name},\n\n"
        f"The expected completion date ({expected_str}) for request {completion_data.get('request_id')} has passed.\n\n"
        f"Update Completion Status: {completion_url}\n\n© {_YEAR} SRM-RMP Approval System."
    )
    return await _dispatch({"to": [email], "subject": f"Overdue: Request {completion_data.get('request_id')} Was Not Marked Completed", "html": html, "text": text}, label="Overdue completion reminder", recipient=email)
