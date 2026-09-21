"""add role permissions

Revision ID: e2a4c9d17b3f
Revises: a1b2c3d4e5f6
Create Date: 2026-09-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e2a4c9d17b3f'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('role_permissions',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('permission_key', sa.String(), nullable=False),
    sa.Column('role', sa.String(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('permission_key', 'role', name='uq_role_permissions_key_role')
    )

    # Seed: every role currently has the download_attachments grant, matching
    # today's behavior (the Download option has always shown for everyone)
    # until an admin narrows it via User Management's "Manage permissions".
    # Role list is inlined rather than imported from app.core.rbac — a
    # migration must stay frozen even if that list changes later.
    role_permissions = sa.table(
        'role_permissions',
        sa.column('permission_key', sa.String),
        sa.column('role', sa.String),
    )
    all_roles = [
        "REQUESTER", "INSTITUTION_MANAGER", "ACCOUNTANT", "HEAD_OF_INSTITUTION",
        "CHAIRMAN_OFFICE", "HR_HEAD", "MMA", "MANAGER_DATA_MANAGEMENT", "AUDIT",
        "MANAGER_ACCOUNTS", "GM_FINANCE", "DIRECTOR_ADMISSIONS", "DIRECTOR_RESEARCH",
        "DEAN_ADMIN", "CHIEF_DIRECTOR", "CHAIRMAN",
    ]
    op.bulk_insert(role_permissions, [
        {"permission_key": "download_attachments", "role": r} for r in all_roles
    ])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_table('role_permissions')
