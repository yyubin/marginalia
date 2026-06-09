"""add drawing strokes

Revision ID: k7f8a9b0c1d2
Revises: j6e7f8a9b0c1
Create Date: 2026-06-09 13:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "k7f8a9b0c1d2"
down_revision: Union[str, None] = "j6e7f8a9b0c1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "drawing_strokes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "document_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("documents.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("page", sa.Integer, nullable=False),
        sa.Column("points", postgresql.JSONB, nullable=False),
        sa.Column("color", sa.String(20), nullable=False, server_default="black"),
        sa.Column("width", sa.Float, nullable=False, server_default="2.0"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_drawing_strokes_doc_user", "drawing_strokes", ["document_id", "user_id"]
    )
    op.create_index(
        "ix_drawing_strokes_doc_page", "drawing_strokes", ["document_id", "page"]
    )


def downgrade() -> None:
    op.drop_index("ix_drawing_strokes_doc_page", table_name="drawing_strokes")
    op.drop_index("ix_drawing_strokes_doc_user", table_name="drawing_strokes")
    op.drop_table("drawing_strokes")
