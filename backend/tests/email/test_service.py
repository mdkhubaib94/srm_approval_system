from app.email import service


async def test_send_signup_otp_includes_code_in_html_and_text(_stub_mail_transport):
    await service.send_signup_otp("new@example.com", "123456", "Jane")

    assert len(_stub_mail_transport) == 1
    sent = _stub_mail_transport[0]
    assert sent["to"] == ["new@example.com"]
    assert "123456" in sent["html"]
    assert "123456" in sent["text"]
    assert "Jane" in sent["html"]


async def test_send_request_notification_created_vs_forwarded_subjects(_stub_mail_transport):
    request_data = {
        "request_id": "EECSE875",
        "title": "New microscope",
        "institution": "EEC",
        "department": "Physics",
        "stage": "ACCOUNTANT",
    }

    await service.send_request_notification("im@example.com", "IM User", request_data, "created")
    created_sent = _stub_mail_transport[-1]
    assert "EECSE875" in created_sent["subject"]
    assert "New Request Submitted" in created_sent["subject"]

    await service.send_request_notification("acct@example.com", "Accountant", request_data, "forwarded")
    forwarded_sent = _stub_mail_transport[-1]
    assert "Forwarded for Your Approval" in forwarded_sent["subject"]
    assert "ACCOUNTANT" in forwarded_sent["html"]


async def test_send_request_notification_includes_comments_only_when_present(_stub_mail_transport):
    request_data = {"request_id": "R1", "title": "T", "institution": "EEC", "department": "Physics", "stage": "ACCOUNTANT", "comments": "Please double-check the quote"}
    await service.send_request_notification("a@example.com", "A", request_data, "forwarded")
    sent = _stub_mail_transport[-1]
    assert "Please double-check the quote" in sent["html"]

    request_data_no_comments = {**request_data, "comments": None}
    await service.send_request_notification("a@example.com", "A", request_data_no_comments, "forwarded")
    sent2 = _stub_mail_transport[-1]
    assert "Comments:" not in sent2["html"]


async def test_send_sla_warning_and_flagged_emails_include_hours_and_stage(_stub_mail_transport):
    request_data = {
        "request_id": "R2",
        "title": "T2",
        "institution": "EEC",
        "department": "Physics",
        "stage": "INSTITUTION_MANAGER",
        "working_hrs_taken": 7.5,
    }

    await service.send_sla_warning_email("im@example.com", "IM", request_data)
    warning_sent = _stub_mail_transport[-1]
    assert "7.5" in warning_sent["html"]
    assert "Flag Reminder" in warning_sent["subject"]

    await service.send_sla_flagged_email("im@example.com", "IM", {**request_data, "working_hrs_taken": 9.1})
    flagged_sent = _stub_mail_transport[-1]
    assert "9.1" in flagged_sent["html"]
    assert "FLAGGED" in flagged_sent["html"]


async def test_send_request_approval_email_links_to_completion_status(_stub_mail_transport):
    await service.send_request_approval_email(
        "req@example.com", "Requester", {"request_id": "R3", "title": "T3", "completed_id": 42}
    )
    sent = _stub_mail_transport[-1]
    assert "/completion-status/42" in sent["html"]
    assert "APPROVED" in sent["html"]


async def test_send_overdue_completion_email_formats_date(_stub_mail_transport):
    from datetime import date

    await service.send_overdue_completion_email(
        "req@example.com", "Requester", {"request_id": "R4", "title": "T4", "completed_id": 7, "expected_completion": date(2026, 1, 15)}
    )
    sent = _stub_mail_transport[-1]
    assert "15 January 2026" in sent["html"]
