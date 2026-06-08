"""add documents cursor index

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-08 14:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_documents_user_created",
        "documents",
        ["user_id", "created_at", "id"],
        postgresql_ops={"created_at": "DESC", "id": "DESC"},
    )


def downgrade() -> None:
    op.drop_index("ix_documents_user_created", table_name="documents")
