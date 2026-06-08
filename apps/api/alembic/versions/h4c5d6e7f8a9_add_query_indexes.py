"""add query indexes

Revision ID: h4c5d6e7f8a9
Revises: g3b4c5d6e7f8
Create Date: 2026-06-08 16:00:00.000000

"""
from typing import Sequence, Union

from alembic import op

revision: str = "h4c5d6e7f8a9"
down_revision: Union[str, None] = "g3b4c5d6e7f8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # highlights ─────────────────────────────────────────────────────────────
    # list_highlights: WHERE document_id = X AND user_id = Y ORDER BY page, created_at
    op.create_index("ix_highlights_doc_user", "highlights", ["document_id", "user_id"])
    # cascade delete (user deleted) + search WHERE user_id = X
    op.create_index("ix_highlights_user_id", "highlights", ["user_id"])

    # notes ───────────────────────────────────────────────────────────────────
    # notes queries: WHERE document_id = X AND user_id = Y
    op.create_index("ix_notes_doc_user", "notes", ["document_id", "user_id"])
    # get_note: WHERE highlight_id = X AND user_id = Y
    op.create_index("ix_notes_highlight_id", "notes", ["highlight_id"])
    # cascade delete + search WHERE user_id = X
    op.create_index("ix_notes_user_id", "notes", ["user_id"])

    # bookmarks ───────────────────────────────────────────────────────────────
    # list_bookmarks + duplicate check: WHERE document_id = X AND user_id = Y [AND page = Z]
    op.create_index("ix_bookmarks_doc_user", "bookmarks", ["document_id", "user_id"])
    # cascade delete
    op.create_index("ix_bookmarks_user_id", "bookmarks", ["user_id"])

    # collections ─────────────────────────────────────────────────────────────
    # _get_or_create_collection (called on every collection operation)
    op.create_index("ix_collections_doc_user", "collections", ["document_id", "user_id"])
    # cascade delete
    op.create_index("ix_collections_user_id", "collections", ["user_id"])

    # collection_items ────────────────────────────────────────────────────────
    # _load_collection: WHERE collection_id = X ORDER BY position
    # (better than plain collection_id — avoids filesort on position)
    op.create_index("ix_collection_items_collection_pos", "collection_items", ["collection_id", "position"])
    # cascade delete when highlight is deleted (highlight_id is 2nd col in UniqueConstraint,
    # so the unique index doesn't cover WHERE highlight_id = X alone)
    op.create_index("ix_collection_items_highlight_id", "collection_items", ["highlight_id"])


def downgrade() -> None:
    op.drop_index("ix_collection_items_highlight_id", table_name="collection_items")
    op.drop_index("ix_collection_items_collection_pos", table_name="collection_items")
    op.drop_index("ix_collections_user_id", table_name="collections")
    op.drop_index("ix_collections_doc_user", table_name="collections")
    op.drop_index("ix_bookmarks_user_id", table_name="bookmarks")
    op.drop_index("ix_bookmarks_doc_user", table_name="bookmarks")
    op.drop_index("ix_notes_user_id", table_name="notes")
    op.drop_index("ix_notes_highlight_id", table_name="notes")
    op.drop_index("ix_notes_doc_user", table_name="notes")
    op.drop_index("ix_highlights_user_id", table_name="highlights")
    op.drop_index("ix_highlights_doc_user", table_name="highlights")
