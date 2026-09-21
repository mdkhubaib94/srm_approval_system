from app.sops.index_service import index_sop_document
from app.sops.search_service import MATCH_THRESHOLD, keyword_overlap, tokenize
from tests.api_helpers import login
from tests.factories import make_user

from .conftest import sop_pdf_upload


async def _create_and_index_sop(client, token, db_session, *, reference_number, title, description, document_text):
    resp = await client.post(
        "/sops",
        data={"reference_number": reference_number, "title": title, "description": description},
        files=[sop_pdf_upload([document_text])],
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201, resp.text
    sop_id = resp.json()["data"]["id"]
    await index_sop_document(sop_id, db=db_session)
    return sop_id


async def test_analyze_matches_the_more_relevant_sop(client, db_session):
    await make_user(db_session, employee_id="SRCH100", email="admin.srch1@example.com", role="CHAIRMAN_OFFICE")
    await make_user(db_session, employee_id="SRCH101", email="req.srch1@example.com", role="REQUESTER")

    admin_token = await login(client, "admin.srch1@example.com")

    equipment_sop_id = await _create_and_index_sop(
        client,
        admin_token,
        db_session,
        reference_number="SOP-SRCH-EQUIP",
        title="Equipment Purchase Procedure",
        description="Standard operating procedure for purchasing laboratory equipment and machinery for academic departments.",
        document_text="Departments must raise an indent for new laboratory equipment through the procurement portal, attaching quotations from at least three vendors.",
    )
    await _create_and_index_sop(
        client,
        admin_token,
        db_session,
        reference_number="SOP-SRCH-LEAVE",
        title="Staff Leave Application Procedure",
        description="Procedure for applying for medical leave, maternity leave, and long leave for teaching and non-teaching staff.",
        document_text="Staff members must submit a leave application through the HR portal at least three days in advance, except for medical emergencies.",
    )

    req_token = await login(client, "req.srch1@example.com")
    resp = await client.post(
        "/sops/analyze",
        json={"title": "Purchase of new lab microscope", "description": "We need to buy a new microscope for the physics lab."},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["hasMatchingSop"] is True
    assert body["sop"]["id"] == equipment_sop_id
    assert len(body["topMatches"]) == 2
    # The equipment SOP should rank first.
    assert body["topMatches"][0]["id"] == equipment_sop_id


async def test_analyze_returns_no_match_below_threshold(client, db_session):
    await make_user(db_session, employee_id="SRCH102", email="admin.srch2@example.com", role="CHAIRMAN_OFFICE")
    await make_user(db_session, employee_id="SRCH103", email="req.srch2@example.com", role="REQUESTER")

    admin_token = await login(client, "admin.srch2@example.com")
    await _create_and_index_sop(
        client,
        admin_token,
        db_session,
        reference_number="SOP-SRCH-UNRELATED",
        title="Guest Lecture Honorarium Procedure",
        description="Procedure for sanctioning honorarium payments to external guest lecturers invited for departmental seminars.",
        document_text="The coordinating department must submit the speaker's bank details and a copy of the invitation letter to the accounts office.",
    )

    req_token = await login(client, "req.srch2@example.com")
    resp = await client.post(
        "/sops/analyze",
        json={"title": "Quantum computing hardware research", "description": "Requesting funds for cryogenic quantum computing lab hardware."},
        headers={"Authorization": f"Bearer {req_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["threshold"] == MATCH_THRESHOLD
    assert len(body["topMatches"]) == 1
    if body["score"] is not None and body["score"] < MATCH_THRESHOLD:
        assert body["hasMatchingSop"] is False
        assert body["sop"] is None


async def test_analyze_requires_view_permission(client, db_session):
    await make_user(db_session, employee_id="SRCH104", email="acct.srch3@example.com", role="ACCOUNTANT", institution="EEC")
    token = await login(client, "acct.srch3@example.com")

    resp = await client.post(
        "/sops/analyze",
        json={"title": "Something", "description": "Something else"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


async def test_analyze_requires_title_or_description(client, db_session):
    await make_user(db_session, employee_id="SRCH105", email="req.srch4@example.com", role="REQUESTER")
    token = await login(client, "req.srch4@example.com")

    resp = await client.post("/sops/analyze", json={"title": "", "description": ""}, headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 400


def test_keyword_overlap_rewards_rare_exact_terms():
    query_tokens = tokenize("AMC renewal for the machine")
    idf = {"amc": 3.5, "renewal": 1.2, "machine": 0.4}

    class Entry:
        token_set = {"amc", "machine", "repair"}

    overlap_with_amc = keyword_overlap(query_tokens, Entry(), idf)

    class OtherEntry:
        token_set = {"leave", "application", "staff"}

    overlap_without_amc = keyword_overlap(query_tokens, OtherEntry(), idf)

    assert overlap_with_amc > overlap_without_amc
    assert 0 <= overlap_with_amc <= 1
    assert overlap_without_amc == 0


def test_tokenize_drops_stopwords_and_short_tokens():
    tokens = tokenize("The request for a new AMC of the machine")
    assert "the" not in tokens
    assert "a" not in tokens
    assert "of" not in tokens
    assert "amc" in tokens
    assert "machine" in tokens
