"""add policy support to queries

Revision ID: a1b2c3d4e5f6
Revises: c4a9f0d31b7e
Create Date: 2026-09-20 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = 'c4a9f0d31b7e'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column('queries', 'request_id', existing_type=sa.Integer(), nullable=True)
    op.add_column('queries', sa.Column('policy_id', sa.Integer(), nullable=True))
    op.create_foreign_key('fk_queries_policy_id_policies', 'queries', 'policies', ['policy_id'], ['id'])
    op.create_check_constraint(
        'ck_queries_exactly_one_parent',
        'queries',
        '(request_id IS NOT NULL AND policy_id IS NULL) OR (request_id IS NULL AND policy_id IS NOT NULL)',
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint('ck_queries_exactly_one_parent', 'queries', type_='check')
    op.drop_constraint('fk_queries_policy_id_policies', 'queries', type_='foreignkey')
    op.drop_column('queries', 'policy_id')
    op.alter_column('queries', 'request_id', existing_type=sa.Integer(), nullable=False)
