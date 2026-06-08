"""add is_verified to users

Revision ID: e1f2a3b4c5d6
Revises: 10edbd059f4e
Create Date: 2026-06-08 12:00:00.000000

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, None] = "10edbd059f4e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("is_verified", sa.Boolean(), nullable=False, server_default="false"),
    )
    # Existing users are grandfathered in as verified so they aren't locked out
    op.execute("UPDATE users SET is_verified = TRUE")


def downgrade() -> None:
    op.drop_column("users", "is_verified")
