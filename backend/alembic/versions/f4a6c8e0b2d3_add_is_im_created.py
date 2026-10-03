"""add is_im_created to requests

Revision ID: f4a6c8e0b2d3
Revises: e3f5b7c9d1a2
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f4a6c8e0b2d3'
down_revision: Union[str, Sequence[str], None] = 'e3f5b7c9d1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('requests', sa.Column('is_im_created', sa.Boolean(), server_default=sa.false(), nullable=False))


def downgrade() -> None:
    op.drop_column('requests', 'is_im_created')
