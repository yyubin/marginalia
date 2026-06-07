"""add is_admin and is_suspended to users

Revision ID: d08a5318a2b0
Revises: ab7b3408fdcf
Create Date: 2026-06-07 21:06:42.599163

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd08a5318a2b0'
down_revision: Union[str, None] = 'ab7b3408fdcf'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('is_admin', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('users', sa.Column('is_suspended', sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    op.drop_column('users', 'is_suspended')
    op.drop_column('users', 'is_admin')
