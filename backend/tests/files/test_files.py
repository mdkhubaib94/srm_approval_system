from app.files.models import StoredFile
from tests.api_helpers import create_mou_request, login, pdf_upload
from tests.factories import make_user


async def test_download_forces_pdf_content_type_and_attachment_disposition(client, db_session):
    await make_user(db_session, employee_id="FIL100", email="req.fil1@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "req.fil1@example.com")
    created = await create_mou_request(client, token, title="Download test")

    # Request attachments aren't echoed in the serialized request response
    # yet, so pull the attachment id straight from the DB instead.
    from sqlalchemy import select

    from app.files.models import RequestAttachment

    result = await db_session.execute(select(RequestAttachment).where(RequestAttachment.request_id == created["id"]))
    attachment = result.scalars().first()
    assert attachment is not None

    resp = await client.get(f"/uploads/files/{attachment.file_id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert resp.headers["x-content-type-options"] == "nosniff"


async def test_download_denies_orphaned_file(client, db_session):
    await make_user(db_session, employee_id="FIL101", email="req.fil2@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "req.fil2@example.com")

    orphan = StoredFile(path_on_disk="nowhere.pdf", original_filename="nowhere.pdf", mimetype="application/pdf", size_bytes=10)
    db_session.add(orphan)
    await db_session.commit()
    await db_session.refresh(orphan)

    resp = await client.get(f"/uploads/files/{orphan.id}", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


async def test_download_nonexistent_file_id_is_404(client, db_session):
    await make_user(db_session, employee_id="FIL102", email="req.fil3@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "req.fil3@example.com")

    resp = await client.get("/uploads/files/999999", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


async def test_unrelated_requester_cannot_download_someone_elses_request_attachment(client, db_session):
    await make_user(db_session, employee_id="FIL103", email="owner.fil4@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="FIL104", email="outsider.fil4@example.com", role="REQUESTER", institution="EEC", department="Physics")

    owner_token = await login(client, "owner.fil4@example.com")
    created = await create_mou_request(client, owner_token)

    from sqlalchemy import select

    from app.files.models import RequestAttachment

    attachment = (
        await db_session.execute(select(RequestAttachment).where(RequestAttachment.request_id == created["id"]))
    ).scalars().first()

    outsider_token = await login(client, "outsider.fil4@example.com")
    resp = await client.get(f"/uploads/files/{attachment.file_id}", headers={"Authorization": f"Bearer {outsider_token}"})
    assert resp.status_code == 404


async def test_stage_holder_can_download_attachment_via_visibility_inheritance(client, db_session):
    """An approver who can view the request (global-view role whose category
    sequence includes their role) can also download its attachments, even
    though they never uploaded anything themselves."""
    await make_user(db_session, employee_id="FIL105", email="req.fil5@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="FIL106", email="chair.fil5@example.com", role="CHAIRMAN")

    req_token = await login(client, "req.fil5@example.com")
    created = await create_mou_request(client, req_token)

    from sqlalchemy import select

    from app.files.models import RequestAttachment

    attachment = (
        await db_session.execute(select(RequestAttachment).where(RequestAttachment.request_id == created["id"]))
    ).scalars().first()

    chair_token = await login(client, "chair.fil5@example.com")
    resp = await client.get(f"/uploads/files/{attachment.file_id}", headers={"Authorization": f"Bearer {chair_token}"})
    assert resp.status_code == 200


async def test_dedicated_upload_endpoint_requires_write_access(client, db_session):
    await make_user(db_session, employee_id="FIL107", email="req.fil6@example.com", role="REQUESTER", institution="EEC", department="Physics")
    await make_user(db_session, employee_id="FIL108", email="acct.fil6@example.com", role="ACCOUNTANT", institution="EEC")

    req_token = await login(client, "req.fil6@example.com")
    created = await create_mou_request(client, req_token)

    # Request is at INSTITUTION_MANAGER; an ACCOUNTANT isn't the stage holder yet.
    acct_token = await login(client, "acct.fil6@example.com")
    resp = await client.post(
        f"/uploads/requests/{created['id']}/attachments",
        files=[pdf_upload("extra.pdf")],
        headers={"Authorization": f"Bearer {acct_token}"},
    )
    assert resp.status_code == 403


async def test_dedicated_upload_endpoint_appends_attachment_for_owner(client, db_session):
    await make_user(db_session, employee_id="FIL109", email="req.fil7@example.com", role="REQUESTER", institution="EEC", department="Physics")
    token = await login(client, "req.fil7@example.com")
    created = await create_mou_request(client, token)

    resp = await client.post(
        f"/uploads/requests/{created['id']}/attachments",
        files=[pdf_upload("extra.pdf")],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200, resp.text
    assert len(resp.json()["attachments"]) == 1

    from sqlalchemy import select

    from app.files.models import RequestAttachment

    count = (
        await db_session.execute(select(RequestAttachment).where(RequestAttachment.request_id == created["id"]))
    ).scalars().all()
    assert len(count) == 2  # original creation attachment + the new one
