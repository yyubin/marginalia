"""add drawing tool column

Revision ID: l8a9b0c1d2e3
Revises: k7f8a9b0c1d2
Create Date: 2026-06-09 14:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "l8a9b0c1d2e3"
down_revision: Union[str, None] = "k7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "drawing_strokes",
        sa.Column("tool", sa.String(20), nullable=False, server_default="pen"),
    )


def downgrade() -> None:
    op.drop_column("drawing_strokes", "tool")
