from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.dependencies import CurrentUser, get_current_user
from app.core.multipart import parse_form_or_json
from app.db.session import get_db
from app.sops import service
from app.sops.search_service import MATCH_THRESHOLD, analyze_sop_match

router = APIRouter(prefix="/sops", tags=["sops"])


def _raise(exc: service.SopServiceError):
    raise HTTPException(status_code=exc.status_code, detail=exc.message)


# ─── Analysis (must be mounted before /{sop_id}) ──────────────────────────────


@router.post("/analyze")
async def analyze(body: dict, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if not service.can_view_sops(current_user.role):
        raise HTTPException(status_code=403, detail="You do not have permission to run SOP analysis")

    title = body.get("title") or ""
    description = body.get("description") or ""
    request_type = body.get("requestType") or body.get("request_type")
    general_category = body.get("generalCategory") or body.get("general_category")
    category = body.get("category")

    parts = [
        title,
        description,
        f"Request Type: {request_type}" if request_type else "",
        f"General Category: {general_category}" if general_category else "",
        f"Category: {category}" if category else "",
    ]
    query_text = ". ".join(p for p in parts if p).strip()

    if not query_text:
        raise HTTPException(status_code=400, detail="Provide a request title and/or description to analyze")

    matches = await analyze_sop_match(db, query_text, f"{title} {description}")

    if not matches:
        return {
            "success": True,
            "has_matching_sop": False,
            "sop_reference": None,
            "sop": None,
            "score": None,
            "threshold": MATCH_THRESHOLD,
            "top_matches": [],
            "message": "No SOPs with embeddings available yet",
        }

    top_matches = [
        {
            "id": m.sop_id,
            "reference_number": m.reference_number,
            "title": m.title,
            "score": round(m.score, 4),
            "vector_score": m.vector_score,
            "keyword_boost": m.keyword_boost,
            "matched_via": m.matched_via,
        }
        for m in matches[:5]
    ]

    best = matches[0]
    if best.score >= MATCH_THRESHOLD:
        sop_result = await service.get_sop(db, current_user, best.sop_id)
        return {
            "success": True,
            "has_matching_sop": True,
            "sop_reference": best.sop_id,
            "sop": sop_result["data"],
            "score": round(best.score, 4),
            "matched_via": best.matched_via,
            "matched_page": best.matched_page,
            "matched_snippet": best.matched_snippet,
            "threshold": MATCH_THRESHOLD,
            "top_matches": top_matches,
        }

    return {
        "success": True,
        "has_matching_sop": False,
        "sop_reference": None,
        "sop": None,
        "score": round(best.score, 4),
        "threshold": MATCH_THRESHOLD,
        "top_matches": top_matches,
        "message": "No SOP passed the similarity threshold",
    }


# ─── CRUD ─────────────────────────────────────────────────────────────────────


@router.get("")
async def get_sops(current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.list_sops(db, current_user)
    except service.SopServiceError as exc:
        _raise(exc)


@router.get("/{sop_id}")
async def get_sop_by_id(sop_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.get_sop(db, current_user, sop_id)
    except service.SopServiceError as exc:
        _raise(exc)


@router.post("", status_code=201)
async def create_sop(
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    fields, attachments = await parse_form_or_json(request)

    reference_number = fields.get("reference_number") or fields.get("referenceNumber")
    title = fields.get("title")
    description = fields.get("description")

    if not reference_number or not title or not description:
        raise HTTPException(400, "referenceNumber, title and description are required")

    try:
        return await service.create_sop(
            db, current_user, reference_number=reference_number, title=title, description=description, files=attachments
        )
    except service.SopServiceError as exc:
        _raise(exc)


@router.post("/{sop_id}/reindex", status_code=202)
async def reindex_sop(sop_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.reindex_sop(db, current_user, sop_id)
    except service.SopServiceError as exc:
        _raise(exc)


@router.patch("/{sop_id}")
async def update_sop(
    sop_id: int,
    request: Request,
    current_user: CurrentUser = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Same either-or contract as update_query: a text-only edit arrives as
    # JSON, a document replacement arrives as multipart/form-data.
    fields, attachments = await parse_form_or_json(request)

    reference_number = fields.get("reference_number") or fields.get("referenceNumber")
    title = fields.get("title")
    description = fields.get("description")
    is_active = fields.get("is_active")
    if is_active is None:
        is_active = fields.get("isActive")

    parsed_is_active = None
    if is_active is not None:
        parsed_is_active = is_active == "true" or is_active is True

    try:
        return await service.update_sop(
            db,
            current_user,
            sop_id,
            reference_number=reference_number,
            title=title,
            description=description,
            is_active=parsed_is_active,
            files=attachments,
        )
    except service.SopServiceError as exc:
        _raise(exc)


@router.delete("/{sop_id}")
async def delete_sop(sop_id: int, current_user: CurrentUser = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    try:
        return await service.delete_sop(db, current_user, sop_id)
    except service.SopServiceError as exc:
        _raise(exc)
