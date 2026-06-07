"""add user_llm_keys table and default provider/fallback settings

Revision ID: 10edbd059f4e
Revises: d08a5318a2b0
Create Date: 2026-06-07 22:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = '10edbd059f4e'
down_revision: Union[str, None] = 'd08a5318a2b0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'user_llm_keys',
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('provider', sa.String(), nullable=False),
        sa.Column('encrypted_key', sa.String(), nullable=False),
        sa.Column('key_preview', sa.String(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('user_id', 'provider'),
    )

    op.add_column('user_settings', sa.Column('default_llm_provider', sa.String(), nullable=True))
    op.add_column('user_settings', sa.Column('llm_fallback_allowed', sa.Boolean(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_settings', 'llm_fallback_allowed')
    op.drop_column('user_settings', 'default_llm_provider')
    op.drop_table('user_llm_keys')
