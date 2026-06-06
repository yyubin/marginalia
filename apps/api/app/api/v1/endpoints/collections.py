import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.collection import Collection, CollectionItem
from app.models.document import Document
from app.models.user import User
from app.schemas.collection import CollectionItemAdd, CollectionItemReorder, CollectionResponse

router = APIRouter(tags=["collections"])


@router.get("/documents/{doc_id}/collection", response_model=CollectionResponse)
async def get_collection(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collection = await _get_or_create_collection(db, doc_id, current_user.id)
    await db.refresh(collection, ["items"])
    return collection


@router.post("/documents/{doc_id}/collection/items", response_model=CollectionResponse, status_code=status.HTTP_201_CREATED)
async def add_collection_item(
    doc_id: uuid.UUID,
    body: CollectionItemAdd,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collection = await _get_or_create_collection(db, doc_id, current_user.id)

    result = await db.execute(
        select(CollectionItem).where(
            CollectionItem.collection_id == collection.id,
            CollectionItem.highlight_id == body.highlight_id,
        )
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Highlight already in collection")

    max_pos_result = await db.execute(
        select(CollectionItem.position)
        .where(CollectionItem.collection_id == collection.id)
        .order_by(CollectionItem.position.desc())
        .limit(1)
    )
    max_pos = max_pos_result.scalar_one_or_none() or 0

    item = CollectionItem(
        collection_id=collection.id,
        highlight_id=body.highlight_id,
        position=max_pos + 1,
    )
    db.add(item)
    await db.commit()
    await db.refresh(collection, ["items"])
    return collection


@router.patch("/documents/{doc_id}/collection/items", response_model=CollectionResponse)
async def reorder_collection_items(
    doc_id: uuid.UUID,
    body: CollectionItemReorder,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collection = await _get_or_create_collection(db, doc_id, current_user.id)

    for item_data in body.items:
        result = await db.execute(
            select(CollectionItem).where(
                CollectionItem.id == item_data["id"],
                CollectionItem.collection_id == collection.id,
            )
        )
        item = result.scalar_one_or_none()
        if item:
            item.position = item_data["position"]

    await db.commit()
    await db.refresh(collection, ["items"])
    return collection


@router.delete("/collection/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_collection_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(CollectionItem)
        .join(Collection)
        .where(CollectionItem.id == item_id, Collection.user_id == current_user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.delete(item)
    await db.commit()


async def _get_or_create_collection(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Collection:
    doc_result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    if not doc_result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")

    result = await db.execute(
        select(Collection)
        .options(selectinload(Collection.items).selectinload(CollectionItem.highlight))
        .where(Collection.document_id == doc_id, Collection.user_id == user_id)
    )
    collection = result.scalar_one_or_none()
    if not collection:
        collection = Collection(document_id=doc_id, user_id=user_id)
        db.add(collection)
        await db.commit()
        await db.refresh(collection)
    return collection
