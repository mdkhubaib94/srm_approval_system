from tests.api_helpers import login
from tests.factories import make_user

from .conftest import sop_pdf_upload


async def test_only_chairman_office_can_create_sop(client, db_session):
    await make_user(db_session, employee_id="SOP100", email="req.sop1@example.com", role="REQUESTER")
    token = await login(client, "req.sop1@example.com")

    resp = await client.post(
        "/sops",
        data={"reference_number": "SOP-001", "title": "Equipment Purchase SOP", "description": "Covers equipment purchase."},
        files=[sop_pdf_upload(["This SOP describes equipment purchase procedures."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_create_sop_requires_document_and_rejects_duplicate_reference(client, db_session):
    await make_user(db_session, employee_id="SOP101", email="admin.sop2@example.com", role="CHAIRMAN_OFFICE")
    token = await login(client, "admin.sop2@example.com")

    no_doc = await client.post(
        "/sops",
        data={"reference_number": "SOP-002", "title": "T", "description": "D"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert no_doc.status_code == 400

    first = await client.post(
        "/sops",
        data={"reference_number": "SOP-002", "title": "T", "description": "D"},
        files=[sop_pdf_upload(["Some content."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert first.status_code == 201, first.text
    assert first.json()["data"]["docIndexStatus"] == "pending"

    duplicate = await client.post(
        "/sops",
        data={"reference_number": "SOP-002", "title": "T2", "description": "D2"},
        files=[sop_pdf_upload(["Other content."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert duplicate.status_code == 409


async def test_sop_view_roles_and_forbidden_role(client, db_session):
    await make_user(db_session, employee_id="SOP102", email="admin.sop3@example.com", role="CHAIRMAN_OFFICE")
    await make_user(db_session, employee_id="SOP103", email="req.sop3@example.com", role="REQUESTER")
    await make_user(db_session, employee_id="SOP104", email="im.sop3@example.com", role="INSTITUTION_MANAGER", institution="EEC")
    await make_user(db_session, employee_id="SOP105", email="acct.sop3@example.com", role="ACCOUNTANT", institution="EEC")

    admin_token = await login(client, "admin.sop3@example.com")
    create_resp = await client.post(
        "/sops",
        data={"reference_number": "SOP-003", "title": "T", "description": "D"},
        files=[sop_pdf_upload(["Content."])],
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert create_resp.status_code == 201

    for email in ("req.sop3@example.com", "im.sop3@example.com"):
        token = await login(client, email)
        resp = await client.get("/sops", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200, f"{email} should be able to view SOPs"
        assert resp.json()["count"] == 1

    acct_token = await login(client, "acct.sop3@example.com")
    forbidden = await client.get("/sops", headers={"Authorization": f"Bearer {acct_token}"})
    assert forbidden.status_code == 403


async def test_soft_delete_hides_sop_from_list(client, db_session):
    await make_user(db_session, employee_id="SOP106", email="admin.sop4@example.com", role="CHAIRMAN_OFFICE")
    token = await login(client, "admin.sop4@example.com")

    create_resp = await client.post(
        "/sops",
        data={"reference_number": "SOP-004", "title": "T", "description": "D"},
        files=[sop_pdf_upload(["Content."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    sop_id = create_resp.json()["data"]["id"]

    delete_resp = await client.delete(f"/sops/{sop_id}", headers={"Authorization": f"Bearer {token}"})
    assert delete_resp.status_code == 200

    list_resp = await client.get("/sops", headers={"Authorization": f"Bearer {token}"})
    assert list_resp.json()["count"] == 0


async def test_update_sop_rejects_duplicate_reference_number(client, db_session):
    await make_user(db_session, employee_id="SOP107", email="admin.sop5@example.com", role="CHAIRMAN_OFFICE")
    token = await login(client, "admin.sop5@example.com")

    await client.post(
        "/sops",
        data={"reference_number": "SOP-005A", "title": "A", "description": "D"},
        files=[sop_pdf_upload(["Content A."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    second = await client.post(
        "/sops",
        data={"reference_number": "SOP-005B", "title": "B", "description": "D"},
        files=[sop_pdf_upload(["Content B."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    second_id = second.json()["data"]["id"]

    resp = await client.patch(
        f"/sops/{second_id}",
        data={"reference_number": "SOP-005A"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409
