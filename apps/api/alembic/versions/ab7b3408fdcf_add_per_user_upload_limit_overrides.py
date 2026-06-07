"""add per-user upload limit overrides

Revision ID: ab7b3408fdcf
Revises: c4d5e6f7a8b9
Create Date: 2026-06-07 20:51:38.944223

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'ab7b3408fdcf'
down_revision: Union[str, None] = 'c4d5e6f7a8b9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('user_settings', sa.Column('max_documents', sa.Integer(), nullable=True))
    op.add_column('user_settings', sa.Column('max_file_size_mb', sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column('user_settings', 'max_file_size_mb')
    op.drop_column('user_settings', 'max_documents')
