import uuid
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, literal, select, text, union_all
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.highlight import Highlight
from app.models.note import Note
from app.models.user import User
from app.schemas.search import SearchResponse, SearchResultItem

router = APIRouter(prefix="/search", tags=["search"])


@router.get("", response_model=SearchResponse)
async def search(
    q: str = Query(min_length=2, max_length=200),
    type: Literal["all", "highlight", "note"] = Query(default="all"),
    document_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=50),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pattern = f"%{q}%"
    uid = current_user.id

    parts = []

    if type in ("all", "highlight"):
        h_text = Highlight.content["text"].astext
        h_stmt = (
            select(
                literal("highlight").label("type"),
                Highlight.id,
                Highlight.document_id,
                Document.title.label("document_title"),
                h_text.label("content_text"),
                Highlight.color,
                literal(None).label("highlight_id"),
                Highlight.created_at,
                func.similarity(h_text, q).label("rank"),
            )
            .join(Document, Document.id == Highlight.document_id)
            .where(
                Highlight.user_id == uid,
                h_text.ilike(pattern),
            )
        )
        if document_id:
            h_stmt = h_stmt.where(Highlight.document_id == document_id)
        parts.append(h_stmt)

    if type in ("all", "note"):
        n_stmt = (
            select(
                literal("note").label("type"),
                Note.id,
                Note.document_id,
                Document.title.label("document_title"),
                Note.content.label("content_text"),
                literal(None).label("color"),
                Note.highlight_id,
                Note.created_at,
                func.similarity(Note.content, q).label("rank"),
            )
            .join(Document, Document.id == Note.document_id)
            .where(
                Note.user_id == uid,
                Note.content.ilike(pattern),
            )
        )
        if document_id:
            n_stmt = n_stmt.where(Note.document_id == document_id)
        parts.append(n_stmt)

    if not parts:
        return SearchResponse(items=[], has_more=False)

    combined = union_all(*parts).alias("results")
    stmt = (
        select(combined)
        .order_by(combined.c.rank.desc(), combined.c.created_at.desc())
        .limit(limit + 1)
        .offset(offset)
    )

    result = await db.execute(stmt)
    rows = result.fetchall()

    has_more = len(rows) > limit
    rows = rows[:limit]

    items = [
        SearchResultItem(
            type=row.type,
            id=row.id,
            document_id=row.document_id,
            document_title=row.document_title,
            content_text=row.content_text or "",
            color=row.color,
            highlight_id=row.highlight_id,
            created_at=row.created_at,
        )
        for row in rows
    ]

    return SearchResponse(items=items, has_more=has_more)
