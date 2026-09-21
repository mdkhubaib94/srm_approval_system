from app.completed.models import Completed
from tests.api_helpers import create_mou_request, login
from tests.factories import make_user


async def _approve_via_full_chain(client, db_session, req_email, req_institution="EEC"):
    """Create a MouDetail (RESEARCH) request and forward it all the way to
    CHAIRMAN, then have the chairman APPROVE it — this is what spawns the
    Completed record under test."""
    from app.core.rbac import ROLES  # noqa: F401  (sanity import only)

    sequence = [
        "INSTITUTION_MANAGER",
        "ACCOUNTANT",
        "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE",
        "AUDIT",
        "MANAGER_ACCOUNTS",
        "DIRECTOR_RESEARCH",
        "DEAN_ADMIN",
        "CHIEF_DIRECTOR",
        "CHAIRMAN",
    ]

    req_token = await login(client, req_email)
    created = await create_mou_request(client, req_token, title="Full chain MOU")
    # Cost defaults to 0, so IM -> ACCOUNTANT is *not* skipped only when cost>0;
    # with cost 0 the IM forward skips straight to HEAD_OF_INSTITUTION. Build
    # the actor list to match that.
    actor_roles = ["INSTITUTION_MANAGER", "HEAD_OF_INSTITUTION", "CHAIRMAN_OFFICE", "AUDIT", "MANAGER_ACCOUNTS", "DIRECTOR_RESEARCH", "DEAN_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN"]

    for i, role in enumerate(actor_roles):
        email = f"actor.{role.lower()}.{req_email}"
        institution = req_institution if role in ("INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION") else None
        await make_user(db_session, employee_id=f"CHAIN-{role}-{req_email}", email=email, role=role, institution=institution)
        token = await login(client, email)

        if role == "CHAIRMAN":
            resp = await client.patch(
                f"/requests/{created['requestID']}",
                data={"action": "forwarded", "status_update": "APPROVED"},
                headers={"Authorization": f"Bearer {token}"},
            )
        else:
            resp = await client.patch(
                f"/requests/{created['requestID']}",
                data={"action": "forwarded"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200, f"forward by {role} failed: {resp.text}"

    return created


async def test_approval_creates_completed_record(client, db_session):
    await make_user(db_session, employee_id="CMP100", email="req.cmp1@example.com", role="REQUESTER", institution="EEC", department="Physics")

    await _approve_via_full_chain(client, db_session, "req.cmp1@example.com")

    from sqlalchemy import select

    result = await db_session.execute(select(Completed))
    completed_rows = result.scalars().all()
    assert len(completed_rows) == 1
    assert completed_rows[0].completed_status is False


async def test_requester_can_set_expected_completion_and_actual_is_one_shot(client, db_session):
    await make_user(db_session, employee_id="CMP101", email="req.cmp2@example.com", role="REQUESTER", institution="EEC", department="Physics")

    created = await _approve_via_full_chain(client, db_session, "req.cmp2@example.com")

    from sqlalchemy import select

    completed_row = (await db_session.execute(select(Completed))).scalar_one()
    completed_id = completed_row.id

    req_token = await login(client, "req.cmp2@example.com")

    expected_resp = await client.patch(
        f"/completed/{completed_id}/expected",
        json={"expectedCompletion": "2026-01-01"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert expected_resp.status_code == 200, expected_resp.text
    assert expected_resp.json()["data"]["expectedCompletion"] == "2026-01-01"

    actual_resp = await client.patch(
        f"/completed/{completed_id}/actual",
        data={"completion_date": "2025-12-15", "completed_status": "true"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert actual_resp.status_code == 200, actual_resp.text
    assert actual_resp.json()["data"]["completedStatus"] is True

    # One-shot: further updates are refused once marked completed.
    second_attempt = await client.patch(
        f"/completed/{completed_id}/actual",
        data={"reason_for_pending": "trying again"},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert second_attempt.status_code == 400


async def test_unrelated_requester_cannot_update_completed(client, db_session):
    await make_user(db_session, employee_id="CMP102", email="req.cmp3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="CMP103", email="outsider.cmp3@example.com", role="REQUESTER", institution="EEC", department="Physics")

    await _approve_via_full_chain(client, db_session, "req.cmp3@example.com")

    from sqlalchemy import select

    completed_id = (await db_session.execute(select(Completed))).scalar_one().id

    outsider_token = await login(client, "outsider.cmp3@example.com")
    resp = await client.patch(
        f"/completed/{completed_id}/expected",
        json={"expectedCompletion": "2026-01-01"},
        headers={"Authorization": f"Bearer {outsider_token}"},
    )
    assert resp.status_code == 404
