from app.flagged.models import Flagged, FlaggedUser
from tests.api_helpers import create_mou_request, login
from tests.factories import make_user


async def _flag_request(db_session, request_row_id: int, stage: str, user_ids: list[int]) -> Flagged:
    flagged = Flagged(request_id=request_row_id, flagged_stage=stage, flag_resolved=False)
    db_session.add(flagged)
    await db_session.flush()
    for uid in user_ids:
        db_session.add(FlaggedUser(flagged_id=flagged.id, user_id=uid))
    await db_session.commit()
    await db_session.refresh(flagged)
    return flagged


async def test_institution_manager_sees_own_institution_flag_only(client, db_session):
    await make_user(db_session, employee_id="FLG100", email="req.flg1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    im_eec = await make_user(db_session, employee_id="FLG101", email="im.eec.flg1@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="FLG102", email="im.dental.flg1@example.com", role="INSTITUTION_MANAGER", institution="DENTAL")

    req_token = await login(client, "req.flg1@example.com")
    created = await create_mou_request(client, req_token)

    await _flag_request(db_session, created["id"], "INSTITUTION_MANAGER", [im_eec.id])

    im_eec_token = await login(client, "im.eec.flg1@example.com")
    resp = await client.get("/flagged", headers={"Authorization": f"Bearer {im_eec_token}"})
    assert resp.status_code == 200
    assert resp.json()["count"] == 1

    im_dental_token = await login(client, "im.dental.flg1@example.com")
    resp2 = await client.get("/flagged", headers={"Authorization": f"Bearer {im_dental_token}"})
    assert resp2.status_code == 200
    assert resp2.json()["count"] == 0


async def test_chairman_sees_all_flags_and_can_resolve(client, db_session):
    await make_user(db_session, employee_id="FLG103", email="req.flg2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    im = await make_user(db_session, employee_id="FLG104", email="im.flg2@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="FLG105", email="chair.flg2@example.com", role="CHAIRMAN")

    req_token = await login(client, "req.flg2@example.com")
    created = await create_mou_request(client, req_token)
    flagged = await _flag_request(db_session, created["id"], "INSTITUTION_MANAGER", [im.id])

    chair_token = await login(client, "chair.flg2@example.com")
    list_resp = await client.get("/flagged", headers={"Authorization": f"Bearer {chair_token}"})
    assert list_resp.status_code == 200
    assert list_resp.json()["count"] == 1

    resolve_resp = await client.patch(f"/flagged/{flagged.id}", headers={"Authorization": f"Bearer {chair_token}"})
    assert resolve_resp.status_code == 200, resolve_resp.text
    body = resolve_resp.json()
    assert body["data"]["flagged"]["flagResolved"] is True
    # RESEARCH sequence: INSTITUTION_MANAGER -> ACCOUNTANT next.
    assert body["data"]["request"]["stage"] == "ACCOUNTANT"

    # Resolving twice is refused.
    second = await client.patch(f"/flagged/{flagged.id}", headers={"Authorization": f"Bearer {chair_token}"})
    assert second.status_code == 400


async def test_mid_chain_role_only_sees_flags_at_own_stage(client, db_session):
    await make_user(db_session, employee_id="FLG106", email="req.flg3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    im = await make_user(db_session, employee_id="FLG107", email="im.flg3@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="FLG108", email="hr.flg3@example.com", role="HR_HEAD")

    req_token = await login(client, "req.flg3@example.com")
    created = await create_mou_request(client, req_token)
    await _flag_request(db_session, created["id"], "INSTITUTION_MANAGER", [im.id])

    hr_token = await login(client, "hr.flg3@example.com")
    resp = await client.get("/flagged", headers={"Authorization": f"Bearer {hr_token}"})
    assert resp.status_code == 200
    assert resp.json()["count"] == 0
