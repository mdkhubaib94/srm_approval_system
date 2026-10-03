"""rename DEAN_ADMIN role to DIRECTOR_ADMIN

Revision ID: e3f5b7c9d1a2
Revises: d7e1a9b2c3f4
"""
from typing import Sequence, Union

from alembic import op

revision: str = 'e3f5b7c9d1a2'
down_revision: Union[str, Sequence[str], None] = 'd7e1a9b2c3f4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _rename(old: str, new: str) -> None:
    # Postgres enum value rename (users.role); the rest are plain string columns.
    op.execute(f"ALTER TYPE user_role RENAME VALUE '{old}' TO '{new}'")
    op.execute(f"UPDATE requests SET stage = '{new}' WHERE stage = '{old}'")
    op.execute(f"UPDATE flagged SET flagged_stage = '{new}' WHERE flagged_stage = '{old}'")
    op.execute(f"UPDATE indent_remarks SET role = '{new}' WHERE role = '{old}'")
    op.execute(f"UPDATE indent_change_log SET role = '{new}' WHERE role = '{old}'")


def upgrade() -> None:
    _rename('DEAN_ADMIN', 'DIRECTOR_ADMIN')


def downgrade() -> None:
    _rename('DIRECTOR_ADMIN', 'DEAN_ADMIN')
