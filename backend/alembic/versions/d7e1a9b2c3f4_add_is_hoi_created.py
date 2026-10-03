"""add is_hoi_created to requests

Revision ID: d7e1a9b2c3f4
Revises: a1b2c3d4e5f6
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd7e1a9b2c3f4'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('requests', sa.Column('is_hoi_created', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column('requests', 'is_hoi_created')
