import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.highlight import Highlight
from app.models.note import Note
from app.models.user import User
from app.schemas.note import NoteCreate, NoteResponse, NoteUpdate

router = APIRouter(tags=["notes"])


@router.get("/highlights/{highlight_id}/note", response_model=NoteResponse | None)
async def get_note(
    highlight_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _get_owned_highlight(db, highlight_id, current_user.id)
    result = await db.execute(
        select(Note).where(Note.highlight_id == highlight_id, Note.user_id == current_user.id)
    )
    note = result.scalar_one_or_none()
    return note


@router.post("/highlights/{highlight_id}/note", response_model=NoteResponse, status_code=status.HTTP_201_CREATED)
async def create_note(
    highlight_id: uuid.UUID,
    body: NoteCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    highlight = await _get_owned_highlight(db, highlight_id, current_user.id)
    note = Note(
        highlight_id=highlight.id,
        document_id=highlight.document_id,
        user_id=current_user.id,
        content=body.content,
    )
    db.add(note)
    await db.commit()
    await db.refresh(note)
    return note


@router.patch("/notes/{note_id}", response_model=NoteResponse)
async def update_note(
    note_id: uuid.UUID,
    body: NoteUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await _get_owned_note(db, note_id, current_user.id)
    note.content = body.content
    await db.commit()
    await db.refresh(note)
    return note


@router.delete("/notes/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_note(
    note_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    note = await _get_owned_note(db, note_id, current_user.id)
    await db.delete(note)
    await db.commit()


async def _get_owned_highlight(db: AsyncSession, highlight_id: uuid.UUID, user_id: uuid.UUID) -> Highlight:
    result = await db.execute(
        select(Highlight).where(Highlight.id == highlight_id, Highlight.user_id == user_id)
    )
    h = result.scalar_one_or_none()
    if not h:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Highlight not found")
    return h


async def _get_owned_note(db: AsyncSession, note_id: uuid.UUID, user_id: uuid.UUID) -> Note:
    result = await db.execute(
        select(Note).where(Note.id == note_id, Note.user_id == user_id)
    )
    n = result.scalar_one_or_none()
    if not n:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Note not found")
    return n
