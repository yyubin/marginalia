import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.document import Document
from app.models.sticky_note import StickyNote
from app.models.user import User
from app.schemas.sticky_note import StickyNoteCreate, StickyNoteResponse, StickyNoteUpdate

router = APIRouter(tags=["sticky-notes"])


async def _assert_doc_owner(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Document:
    doc = await db.scalar(select(Document).where(Document.id == doc_id, Document.user_id == user_id))
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc


async def _get_owned_note(db: AsyncSession, note_id: uuid.UUID, user_id: uuid.UUID) -> StickyNote:
    note = await db.scalar(
        select(StickyNote).where(StickyNote.id == note_id, StickyNote.user_id == user_id)
    )
    if not note:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sticky note not found")
    return note


@router.get("/documents/{doc_id}/sticky-notes", response_model=list[StickyNoteResponse])
async def list_sticky_notes(
    doc_id: uuid.UUID,
    page_from: int = Query(default=1, ge=1),
    limit: int | None = Query(default=None, ge=1, le=1000),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    stmt = (
        select(StickyNote)
        .where(
            StickyNote.document_id == doc_id,
            StickyNote.user_id == current_user.id,
            StickyNote.page >= page_from,
        )
        .order_by(StickyNote.page, StickyNote.created_at)
    )
    if limit is not None:
        stmt = stmt.limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post(
    "/documents/{doc_id}/sticky-notes",
    response_model=StickyNoteResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_sticky_note(
    doc_id: uuid.UUID,
    body: StickyNoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    note = StickyNote(
        document_id=doc_id,
        user_id=current_user.id,
        page=body.page,
        x=body.x,
        y=body.y,
        width=body.width,
        content=body.content,
        color=body.color,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/sticky-notes/{note_id}", response_model=StickyNoteResponse)
async def update_sticky_note(
    note_id: uuid.UUID,
    body: StickyNoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await _get_owned_note(db, note_id, current_user.id)
    if body.x is not None:
        note.x = body.x
    if body.y is not None:
        note.y = body.y
    if body.width is not None:
        note.width = body.width
    if body.content is not None:
        note.content = body.content
    if body.color is not None:
        note.color = body.color
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/sticky-notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_sticky_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await _get_owned_note(db, note_id, current_user.id)
    await db.delete(note)
    await db.commit()
