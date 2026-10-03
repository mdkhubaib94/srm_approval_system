"""backfill completed records for approved requests

Every APPROVED request must have a row in `completed` (that row is what the
Completion Status page tracks). Creates the missing rows for any request that
was approved without one. Idempotent.

Revision ID: b8c2d4e6f9a1
Revises: f4a6c8e0b2d3
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'b8c2d4e6f9a1'
down_revision: Union[str, Sequence[str], None] = 'f4a6c8e0b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        """
        INSERT INTO completed (request_id, completed_status, overdue_email_sent)
        SELECT r.id, false, false
        FROM requests r
        WHERE r.status = 'APPROVED'
          AND NOT EXISTS (SELECT 1 FROM completed c WHERE c.request_id = r.id)
        """
    )


def downgrade() -> None:
    # Data backfill only; the rows may since have been filled in by users,
    # so they are deliberately not removed.
    pass
