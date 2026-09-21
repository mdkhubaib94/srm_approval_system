"""Decide whether the caller may read a given stored file, by finding the
document that references it. Port of uploadController.js's canAccessFile.

Ownership is resolved from the referencing document rather than trusting any
metadata on the file row itself — the same discipline as the source, which
resolves through the owning Mongo document rather than GridFS metadata.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.dependencies import CurrentUser
from app.completed.models import Completed
from app.queries.models import Query
from app.requests.access import can_view_completed, can_view_query, can_view_request
from app.requests.models import Request, RequestActionHistory

from app.files.models import CompletedAttachment, PolicyAttachment, QueryAttachment, RequestAttachment, SopAttachment


async def can_access_file(db: AsyncSession, current_user: CurrentUser, file_id: int) -> bool:
    # Requests own their attachments directly.
    request_row = (
        await db.execute(
            select(Request)
            .join(RequestAttachment, RequestAttachment.request_id == Request.id)
            .where(RequestAttachment.file_id == file_id)
            .options(selectinload(Request.action_history).selectinload(RequestActionHistory.action_by))
        )
    ).scalar_one_or_none()
    if request_row is not None:
        return can_view_request(current_user, request_row)

    # Completion records hang off a request — inherit its visibility.
    completed_row = (
        await db.execute(
            select(Completed)
            .join(CompletedAttachment, CompletedAttachment.completed_id == Completed.id)
            .where(CompletedAttachment.file_id == file_id)
            .options(selectinload(Completed.request).selectinload(Request.action_history).selectinload(RequestActionHistory.action_by))
        )
    ).scalar_one_or_none()
    if completed_row is not None:
        return completed_row.request is not None and can_view_completed(current_user, completed_row.request)

    query_row = (
        await db.execute(
            select(Query)
            .join(QueryAttachment, QueryAttachment.query_id == Query.id)
            .where(QueryAttachment.file_id == file_id)
            .options(selectinload(Query.request).selectinload(Request.action_history).selectinload(RequestActionHistory.action_by))
        )
    ).scalar_one_or_none()
    if query_row is not None:
        if query_row.request is not None:
            return can_view_query(current_user, query_row.request)
        # A query with no resolvable parent is visible to authenticated staff only.
        return current_user.role != "REQUESTER"

    # Policies and SOPs are reference material for all authenticated users;
    # their list endpoints already expose them.
    policy_exists = (
        await db.execute(select(PolicyAttachment.id).where(PolicyAttachment.file_id == file_id).limit(1))
    ).scalar_one_or_none()
    if policy_exists is not None:
        return True

    sop_exists = (
        await db.execute(select(SopAttachment.id).where(SopAttachment.file_id == file_id).limit(1))
    ).scalar_one_or_none()
    if sop_exists is not None:
        return True

    # Orphaned file with no referencing document — deny.
    return False
