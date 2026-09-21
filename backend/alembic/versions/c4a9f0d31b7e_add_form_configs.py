"""add form configs

Revision ID: c4a9f0d31b7e
Revises: 765e6f003c81
Create Date: 2026-09-19 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = 'c4a9f0d31b7e'
down_revision: Union[str, Sequence[str], None] = '765e6f003c81'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table('form_configs',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('request_type', sa.String(), nullable=False),
    sa.Column('title', sa.String(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('request_type')
    )
    op.create_table('form_config_fields',
    sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
    sa.Column('form_config_id', sa.Integer(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('name', sa.String(), nullable=False),
    sa.Column('label', sa.String(), nullable=False),
    sa.Column('field_type', sa.Enum('text', 'number', 'textarea', 'select', 'date', 'file', 'tableObject', name='form_field_type'), nullable=False),
    sa.Column('required', sa.Boolean(), server_default='false', nullable=False),
    sa.Column('options', postgresql.ARRAY(sa.String()), nullable=True),
    sa.Column('validation_min', sa.Numeric(), nullable=True),
    sa.Column('validation_max', sa.Numeric(), nullable=True),
    sa.Column('validation_regex', sa.String(), nullable=True),
    sa.ForeignKeyConstraint(['form_config_id'], ['form_configs.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_form_config_fields_form_config_id', 'form_config_fields', ['form_config_id'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index('ix_form_config_fields_form_config_id', table_name='form_config_fields')
    op.drop_table('form_config_fields')
    op.drop_table('form_configs')

    # Not auto-generated: op.drop_table() doesn't drop the Postgres ENUM
    # type backing form_config_fields.field_type — same fix as prior
    # migrations, needed for the downgrade-then-upgrade cycle
    # tests/conftest.py runs once per session.
    sa.Enum(name='form_field_type').drop(op.get_bind(), checkfirst=True)
