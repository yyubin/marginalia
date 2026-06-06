import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.bookmark import Bookmark
from app.models.document import Document
from app.models.user import User
from app.schemas.bookmark import BookmarkCreate, BookmarkUpdate, BookmarkResponse

router = APIRouter(tags=["bookmarks"])


@router.get("/documents/{doc_id}/bookmarks", response_model=list[BookmarkResponse])
async def list_bookmarks(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)
    result = await db.execute(
        select(Bookmark)
        .where(Bookmark.document_id == doc_id, Bookmark.user_id == current_user.id)
        .order_by(Bookmark.page, Bookmark.created_at)
    )
    return result.scalars().all()


@router.post("/documents/{doc_id}/bookmarks", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
async def create_bookmark(
    doc_id: uuid.UUID,
    body: BookmarkCreate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    await _assert_doc_owner(db, doc_id, current_user.id)

    existing = await db.execute(
        select(Bookmark).where(
            Bookmark.document_id == doc_id,
            Bookmark.user_id == current_user.id,
            Bookmark.page == body.page,
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Bookmark already exists for this page")

    bookmark = Bookmark(
        document_id=doc_id,
        user_id=current_user.id,
        page=body.page,
        label=body.label,
    )
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return bookmark


@router.patch("/bookmarks/{bookmark_id}", response_model=BookmarkResponse)
async def update_bookmark(
    bookmark_id: uuid.UUID,
    body: BookmarkUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookmark = await _get_owned_bookmark(db, bookmark_id, current_user.id)
    bookmark.label = body.label
    await db.commit()
    await db.refresh(bookmark)
    return bookmark


@router.delete("/bookmarks/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    bookmark_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    bookmark = await _get_owned_bookmark(db, bookmark_id, current_user.id)
    await db.delete(bookmark)
    await db.commit()


async def _assert_doc_owner(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> None:
    result = await db.execute(select(Document).where(Document.id == doc_id, Document.user_id == user_id))
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")


async def _get_owned_bookmark(db: AsyncSession, bookmark_id: uuid.UUID, user_id: uuid.UUID) -> Bookmark:
    result = await db.execute(
        select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == user_id)
    )
    b = result.scalar_one_or_none()
    if not b:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bookmark not found")
    return b
