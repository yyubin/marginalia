"""add search trgm indexes

Revision ID: g3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-08 15:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "g3b4c5d6e7f8"
down_revision: Union[str, None] = "f2a3b4c5d6e7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        """
        CREATE INDEX ix_highlights_content_text_trgm
        ON highlights USING GIN ((content->>'text') gin_trgm_ops)
        """
    )
    op.execute(
        """
        CREATE INDEX ix_notes_content_trgm
        ON notes USING GIN (content gin_trgm_ops)
        """
    )


def downgrade() -> None:
    op.drop_index("ix_notes_content_trgm", table_name="notes")
    op.drop_index("ix_highlights_content_text_trgm", table_name="highlights")
