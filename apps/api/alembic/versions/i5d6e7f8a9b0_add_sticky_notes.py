"""add sticky notes

Revision ID: i5d6e7f8a9b0
Revises: h4c5d6e7f8a9
Create Date: 2026-06-08 20:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "i5d6e7f8a9b0"
down_revision: Union[str, None] = "h4c5d6e7f8a9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "sticky_notes",
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
        sa.Column("x", sa.Float, nullable=False),
        sa.Column("y", sa.Float, nullable=False),
        sa.Column("width", sa.Float, nullable=False, server_default="20.0"),
        sa.Column("content", sa.Text, nullable=False, server_default=""),
        sa.Column("color", sa.String(20), nullable=False, server_default="yellow"),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index("ix_sticky_notes_doc_user", "sticky_notes", ["document_id", "user_id"])
    op.create_index("ix_sticky_notes_doc_page", "sticky_notes", ["document_id", "page"])


def downgrade() -> None:
    op.drop_index("ix_sticky_notes_doc_page", table_name="sticky_notes")
    op.drop_index("ix_sticky_notes_doc_user", table_name="sticky_notes")
    op.drop_table("sticky_notes")
