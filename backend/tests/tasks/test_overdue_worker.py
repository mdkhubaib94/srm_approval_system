from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select

from app.completed.models import Completed
from app.tasks.overdue_worker import check_overdue_completions
from tests.api_helpers import create_mou_request, login
from tests.factories import make_user

NOW = datetime(2026, 9, 15, 10, 0, tzinfo=timezone.utc)


async def _make_completed_request(client, db_session, email_suffix: str, *, expected_completion: date, completed_status: bool = False, overdue_email_sent: bool = False):
    await make_user(db_session, employee_id=f"OVD-{email_suffix}", email=f"req.{email_suffix}@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, f"req.{email_suffix}@example.com")
    created = await create_mou_request(client, token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    completed = Completed(
        request_id=request_row.id,
        expected_completion=expected_completion,
        completed_status=completed_status,
        overdue_email_sent=overdue_email_sent,
    )
    db_session.add(completed)
    await db_session.commit()
    await db_session.refresh(completed)
    return completed


async def test_overdue_worker_emails_once_and_sets_flag(client, db_session, monkeypatch):
    sent = []

    async def fake_send(email, name, data):
        sent.append((email, data["request_id"]))

    monkeypatch.setattr("app.tasks.overdue_worker.send_overdue_completion_email", fake_send)

    completed = await _make_completed_request(client, db_session, "ovd1", expected_completion=(NOW - timedelta(days=2)).date())

    await check_overdue_completions(now=NOW, db=db_session)

    await db_session.refresh(completed)
    assert completed.overdue_email_sent is True
    assert len(sent) == 1


async def test_overdue_worker_skips_already_notified(client, db_session, monkeypatch):
    sent = []

    async def fake_send(email, name, data):
        sent.append(email)

    monkeypatch.setattr("app.tasks.overdue_worker.send_overdue_completion_email", fake_send)

    await _make_completed_request(
        client, db_session, "ovd2", expected_completion=(NOW - timedelta(days=2)).date(), overdue_email_sent=True
    )

    await check_overdue_completions(now=NOW, db=db_session)
    assert sent == []


async def test_overdue_worker_skips_already_completed(client, db_session, monkeypatch):
    sent = []

    async def fake_send(email, name, data):
        sent.append(email)

    monkeypatch.setattr("app.tasks.overdue_worker.send_overdue_completion_email", fake_send)

    await _make_completed_request(
        client, db_session, "ovd3", expected_completion=(NOW - timedelta(days=2)).date(), completed_status=True
    )

    await check_overdue_completions(now=NOW, db=db_session)
    assert sent == []


async def test_overdue_worker_skips_not_yet_due(client, db_session, monkeypatch):
    sent = []

    async def fake_send(email, name, data):
        sent.append(email)

    monkeypatch.setattr("app.tasks.overdue_worker.send_overdue_completion_email", fake_send)

    await _make_completed_request(client, db_session, "ovd4", expected_completion=(NOW + timedelta(days=5)).date())

    await check_overdue_completions(now=NOW, db=db_session)
    assert sent == []


async def test_overdue_worker_treats_due_today_as_overdue(client, db_session, monkeypatch):
    """A deadline of today is already overdue, matching the source's
    `expectedCompletion: { $lt: now } ` against a midnight-of-due-date
    Date — not overdue only starting tomorrow."""
    sent = []

    async def fake_send(email, name, data):
        sent.append(email)

    monkeypatch.setattr("app.tasks.overdue_worker.send_overdue_completion_email", fake_send)

    await _make_completed_request(client, db_session, "ovd5", expected_completion=NOW.date())

    await check_overdue_completions(now=NOW, db=db_session)
    assert len(sent) == 1
