"""add thumbnail_key to documents

Revision ID: m9b0c1d2e3f4
Revises: l8a9b0c1d2e3
Create Date: 2026-06-09 15:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "m9b0c1d2e3f4"
down_revision: Union[str, None] = "l8a9b0c1d2e3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("documents", sa.Column("thumbnail_key", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("documents", "thumbnail_key")
