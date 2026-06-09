import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.drawing_stroke import DrawingStroke
from app.models.user import User
from app.schemas.drawing import DrawingStrokeCreate, DrawingStrokeResponse

router = APIRouter(tags=["drawings"])


async def _assert_doc_owner(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Document:
    doc = await db.scalar(select(Document).where(Document.id == doc_id, Document.user_id == user_id))
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


async def _get_owned_stroke(db: AsyncSession, stroke_id: uuid.UUID, user_id: uuid.UUID) -> DrawingStroke:
    stroke = await db.scalar(
        select(DrawingStroke).where(DrawingStroke.id == stroke_id, DrawingStroke.user_id == user_id)
    )
    if not stroke:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Drawing stroke not found")
    return stroke


@router.get("/documents/{doc_id}/drawings", response_model=list[DrawingStrokeResponse])
async def list_drawings(
    doc_id: uuid.UUID,
    page: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    stmt = (
        select(DrawingStroke)
        .where(DrawingStroke.document_id == doc_id, DrawingStroke.user_id == current_user.id)
        .order_by(DrawingStroke.page, DrawingStroke.created_at)
    )
    if page is not None:
        stmt = stmt.where(DrawingStroke.page == page)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/documents/{doc_id}/drawings",
    response_model=DrawingStrokeResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_drawing(
    doc_id: uuid.UUID,
    body: DrawingStrokeCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    stroke = DrawingStroke(
        document_id=doc_id,
        user_id=current_user.id,
        page=body.page,
        points=body.points,
        color=body.color,
        width=body.width,
    )
    db.add(stroke)
    await db.commit()
    await db.refresh(stroke)
    return stroke


@router.delete("/drawings/{stroke_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drawing(
    stroke_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    stroke = await _get_owned_stroke(db, stroke_id, current_user.id)
    await db.delete(stroke)
    await db.commit()


@router.delete("/documents/{doc_id}/drawings", status_code=status.HTTP_204_NO_CONTENT)
async def clear_drawings(
    doc_id: uuid.UUID,
    page: int | None = Query(default=None, ge=1),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    stmt = delete(DrawingStroke).where(
        DrawingStroke.document_id == doc_id,
        DrawingStroke.user_id == current_user.id,
    )
    if page is not None:
        stmt = stmt.where(DrawingStroke.page == page)
    await db.execute(stmt)
    await db.commit()
