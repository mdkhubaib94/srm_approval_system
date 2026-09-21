from datetime import datetime, timedelta, timezone

from sqlalchemy import select

from app.flagged.models import Flagged, FlaggedUser
from app.tasks.sla_worker import _is_business_hours, update_request_working_hours_high_scale
from tests.api_helpers import create_mou_request, login
from tests.factories import make_user

# A fixed Tuesday 14:00 UTC — safely inside business hours (9-18, Mon-Sat).
BUSINESS_HOURS_NOW = datetime(2026, 9, 15, 14, 0, tzinfo=timezone.utc)
# A Sunday, same hour — outside business hours.
SUNDAY_NOW = datetime(2026, 9, 13, 14, 0, tzinfo=timezone.utc)
# A Tuesday at 20:00 — outside the 9-18 window.
AFTER_HOURS_NOW = datetime(2026, 9, 15, 20, 0, tzinfo=timezone.utc)


def test_is_business_hours_excludes_sunday_and_off_hours():
    assert _is_business_hours(BUSINESS_HOURS_NOW) is True
    assert _is_business_hours(SUNDAY_NOW) is False
    assert _is_business_hours(AFTER_HOURS_NOW) is False
    # Saturday during business hours IS included (Mon-Sat).
    saturday_business_hours = datetime(2026, 9, 19, 10, 0, tzinfo=timezone.utc)
    assert _is_business_hours(saturday_business_hours) is True


async def test_sweep_flags_request_past_eight_hours_and_notifies_responsible_users(client, db_session):
    await make_user(db_session, employee_id="SLA100", email="req.sla1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="SLA101", email="im.sla1@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.sla1@example.com")
    created = await create_mou_request(client, req_token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    request_row.stage_arrived_at = BUSINESS_HOURS_NOW - timedelta(hours=9)
    await db_session.commit()

    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW, db=db_session)

    await db_session.refresh(request_row)
    assert float(request_row.working_hrs_taken) > 8

    flagged = (await db_session.execute(select(Flagged).where(Flagged.request_id == request_row.id))).scalars().all()
    assert len(flagged) == 1
    assert flagged[0].flagged_stage == "INSTITUTION_MANAGER"

    flagged_users = (await db_session.execute(select(FlaggedUser).where(FlaggedUser.flagged_id == flagged[0].id))).scalars().all()
    assert len(flagged_users) == 1


async def test_sweep_does_not_duplicate_flag_on_repeated_runs(client, db_session):
    await make_user(db_session, employee_id="SLA102", email="req.sla2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="SLA103", email="im.sla2@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.sla2@example.com")
    created = await create_mou_request(client, req_token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    request_row.stage_arrived_at = BUSINESS_HOURS_NOW - timedelta(hours=9)
    await db_session.commit()

    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW, db=db_session)
    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW + timedelta(minutes=5), db=db_session)

    flagged = (await db_session.execute(select(Flagged).where(Flagged.request_id == request_row.id))).scalars().all()
    assert len(flagged) == 1


async def test_sweep_skips_outside_business_hours(client, db_session):
    await make_user(db_session, employee_id="SLA104", email="req.sla3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="SLA105", email="im.sla3@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    req_token = await login(client, "req.sla3@example.com")
    created = await create_mou_request(client, req_token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    request_row.stage_arrived_at = SUNDAY_NOW - timedelta(hours=9)
    original_hours = request_row.working_hrs_taken
    await db_session.commit()

    await update_request_working_hours_high_scale(now=SUNDAY_NOW, db=db_session)

    await db_session.refresh(request_row)
    assert request_row.working_hrs_taken == original_hours

    flagged = (await db_session.execute(select(Flagged).where(Flagged.request_id == request_row.id))).scalars().all()
    assert len(flagged) == 0


async def test_sla_warning_fires_once_on_crossing_seven_hours(client, db_session, monkeypatch):
    await make_user(db_session, employee_id="SLA107", email="req.sla5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="SLA108", email="im.sla5@example.com", role="INSTITUTION_MANAGER", institution="EEC")

    warned_calls = []

    async def fake_warning(email, name, request_data):
        warned_calls.append(email)

    monkeypatch.setattr("app.tasks.sla_worker.send_sla_warning_email", fake_warning)

    req_token = await login(client, "req.sla5@example.com")
    created = await create_mou_request(client, req_token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    request_row.stage_arrived_at = BUSINESS_HOURS_NOW - timedelta(hours=7, minutes=30)
    await db_session.commit()

    # First run: crosses from <=7h into the (7, 8] band -> warns once.
    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW, db=db_session)
    assert warned_calls == ["im.sla5@example.com"]

    # Second run a few minutes later, still within the (7, 8] band: must NOT
    # warn again (edge-triggered on the previous_hours <= 7 crossing only).
    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW + timedelta(minutes=10), db=db_session)
    assert warned_calls == ["im.sla5@example.com"]

    # No flag yet — still under the 8h breach threshold.
    flagged = (await db_session.execute(select(Flagged).where(Flagged.request_id == request_row.id))).scalars().all()
    assert len(flagged) == 0


async def test_sweep_ignores_requests_not_pending(client, db_session):
    await make_user(db_session, employee_id="SLA106", email="req.sla4@example.com", role="REQUESTER", institution="EEC", department="Physics")

    req_token = await login(client, "req.sla4@example.com")
    created = await create_mou_request(client, req_token)

    from app.requests.models import Request

    request_row = await db_session.get(Request, created["id"])
    request_row.stage_arrived_at = BUSINESS_HOURS_NOW - timedelta(hours=9)
    request_row.status = "QUERY"
    await db_session.commit()

    await update_request_working_hours_high_scale(now=BUSINESS_HOURS_NOW, db=db_session)

    flagged = (await db_session.execute(select(Flagged).where(Flagged.request_id == request_row.id))).scalars().all()
    assert len(flagged) == 0
