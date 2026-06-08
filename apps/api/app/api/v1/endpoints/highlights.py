import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, Integer, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.highlight import Highlight
from app.models.user import User
from app.schemas.highlight import VALID_COLORS, HighlightColorUpdate, HighlightCreate, HighlightResponse

router = APIRouter(tags=["highlights"])


@router.get("/documents/{doc_id}/highlights", response_model=list[HighlightResponse])
async def list_highlights(
    doc_id: uuid.UUID,
    pdf_page_from: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    page_col = cast(Highlight.position["pageNumber"].astext, Integer)
    result = await db.execute(
        select(Highlight)
        .options(selectinload(Highlight.note))
        .where(
            Highlight.document_id == doc_id,
            Highlight.user_id == current_user.id,
            page_col >= pdf_page_from,
        )
        .order_by(page_col, Highlight.created_at)
        .limit(limit)
    )
    return result.scalars().all()


@router.post("/documents/{doc_id}/highlights", response_model=HighlightResponse, status_code=status.HTTP_201_CREATED)
async def create_highlight(
    doc_id: uuid.UUID,
    body: HighlightCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    if body.color not in VALID_COLORS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid color. Use one of {VALID_COLORS}")

    highlight = Highlight(
        document_id=doc_id,
        user_id=current_user.id,
        position=body.position,
        content=body.content,
        color=body.color,
    )
    db.add(highlight)
    await db.commit()
    result = await db.execute(
        select(Highlight).options(selectinload(Highlight.note)).where(Highlight.id == highlight.id)
    )
    return result.scalar_one()


@router.patch("/highlights/{highlight_id}", response_model=HighlightResponse)
async def update_highlight_color(
    highlight_id: uuid.UUID,
    body: HighlightColorUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    highlight = await _get_owned_highlight(db, highlight_id, current_user.id)
    if body.color not in VALID_COLORS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Invalid color")
    highlight.color = body.color
    await db.commit()
    result = await db.execute(
        select(Highlight).options(selectinload(Highlight.note)).where(Highlight.id == highlight.id)
    )
    return result.scalar_one()


@router.delete("/highlights/{highlight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_highlight(
    highlight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    highlight = await _get_owned_highlight(db, highlight_id, current_user.id)
    await db.delete(highlight)
    await db.commit()


async def _assert_doc_owner(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


async def _get_owned_highlight(db: AsyncSession, highlight_id: uuid.UUID, user_id: uuid.UUID) -> Highlight:
    result = await db.execute(
        select(Highlight).options(selectinload(Highlight.note)).where(Highlight.id == highlight_id, Highlight.user_id == user_id)
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found")
    return h
