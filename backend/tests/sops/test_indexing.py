from sqlalchemy import select

from app.sops.index_service import index_sop_document
from app.sops.models import Sop, SopChunk
from app.sops.pdf_text_service import CHUNK_MAX, chunk_page_text, clean_page_text
from tests.api_helpers import login
from tests.factories import make_user

from .conftest import sop_pdf_upload


async def test_indexing_extracts_chunks_via_text_layer(client, db_session):
    await make_user(db_session, employee_id="IDX100", email="admin.idx1@example.com", role="CHAIRMAN_OFFICE")
    token = await login(client, "admin.idx1@example.com")

    create_resp = await client.post(
        "/sops",
        data={"reference_number": "SOP-IDX-1", "title": "Equipment Purchase SOP", "description": "Procedure for equipment purchase."},
        files=[sop_pdf_upload(["All departments must submit an indent through the online AMC portal before purchasing lab equipment."])],
        headers={"Authorization": f"Bearer {token}"},
    )
    sop_id = create_resp.json()["data"]["id"]
    assert create_resp.json()["data"]["docIndexStatus"] == "pending"

    # Bypass the fire-and-forget queue and run the pipeline directly on the
    # test's own transactional session (see index_service.index_sop_document's
    # docstring for why this must reuse `db_session`, not open a new one).
    await index_sop_document(sop_id, db=db_session)

    sop = await db_session.get(Sop, sop_id)
    assert sop.doc_index_status == "done"
    assert sop.extraction_method == "text"
    assert sop.description_embedding is not None
    assert len(sop.description_embedding) == 384

    chunks = (await db_session.execute(select(SopChunk).where(SopChunk.sop_id == sop_id))).scalars().all()
    assert len(chunks) == 1
    assert "AMC" in chunks[0].text
    assert chunks[0].embedding is not None
    assert len(chunks[0].embedding) == 384


async def test_indexing_marks_no_document_when_sop_has_no_attachment(client, db_session):
    admin = await make_user(db_session, employee_id="IDX101", email="admin.idx2@example.com", role="CHAIRMAN_OFFICE")

    sop = Sop(reference_number="SOP-IDX-2", title="No doc", description="No document attached", created_by_id=admin.id)
    db_session.add(sop)
    await db_session.commit()
    await db_session.refresh(sop)

    await index_sop_document(sop.id, db=db_session)

    await db_session.refresh(sop)
    assert sop.doc_index_status == "no_document"
    # Description embedding is still generated even with no document.
    assert sop.description_embedding is not None


def test_clean_page_text_strips_boilerplate_but_keeps_subject_content():
    raw = "Ref. No: SRM/EEC/2024/001\nSub: Equipment Purchase Procedure\nDear Sir/Madam\nThis is the actual body text.\nYours faithfully,\n(Sd/-)"
    cleaned = clean_page_text(raw)
    assert "Ref. No" not in cleaned
    assert "Dear Sir" not in cleaned
    assert "Yours faithfully" not in cleaned
    assert "(Sd/-)" not in cleaned
    assert "Equipment Purchase Procedure" in cleaned  # Subject label stripped, content kept
    assert "This is the actual body text." in cleaned


def test_chunk_page_text_respects_target_max_and_overlap():
    # Build text well past CHUNK_MAX so it must split into multiple chunks.
    sentence = "This is a filler sentence about equipment procurement policy. "
    long_text = (sentence * 60).strip()
    assert len(long_text) > CHUNK_MAX

    chunks = chunk_page_text(long_text, page=3)
    assert len(chunks) > 1
    for chunk in chunks:
        assert chunk["page"] == 3
        assert len(chunk["text"]) <= CHUNK_MAX + 250  # overlap carry-over allowance
    # Overlap: a chunk of the previous chunk's tail (well within the 200-char
    # overlap window) should reappear near the start of the next chunk.
    tail_probe = chunks[0]["text"][-50:]
    assert tail_probe in chunks[1]["text"][:260]


def test_chunk_page_text_skips_short_fragments():
    assert chunk_page_text("short", page=1) == []
    assert chunk_page_text("", page=1) == []
