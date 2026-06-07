import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_admin
from app.models.document import Document
from app.models.user import User
from app.models.user_llm_key import UserLLMKey
from app.models.user_settings import UserSettings
from app.schemas.admin import (
    AdminLLMFallbackUpdate,
    AdminStatsResponse,
    AdminUserDetail,
    AdminUserLimitsUpdate,
    AdminUserListItem,
    AdminUserListResponse,
)
from app.services.r2_service import delete_file

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


async def _get_user_or_404(db: AsyncSession, user_id: uuid.UUID) -> User:
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="유저를 찾을 수 없습니다")
    return user


async def _build_user_detail(db: AsyncSession, user: User) -> AdminUserDetail:
    docs = (
        await db.execute(
            select(Document).where(Document.user_id == user.id).order_by(Document.created_at.desc())
        )
    ).scalars().all()

    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    max_documents = user_settings.effective_max_documents if user_settings else settings.MAX_DOCUMENTS_PER_USER
    max_file_size_mb = user_settings.effective_max_file_size_mb if user_settings else settings.MAX_FILE_SIZE_MB
    llm_fallback_allowed = (
        user_settings.effective_llm_fallback_allowed if user_settings else settings.DEFAULT_LLM_FALLBACK_ALLOWED
    )

    llm_keys = (await db.execute(select(UserLLMKey.provider).where(UserLLMKey.user_id == user.id))).scalars().all()

    return AdminUserDetail(
        id=user.id,
        email=user.email,
        name=user.name,
        provider=user.provider,
        is_admin=user.is_admin,
        is_suspended=user.is_suspended,
        created_at=user.created_at,
        documents=list(docs),
        total_storage_bytes=sum(doc.file_size or 0 for doc in docs),
        max_documents=max_documents,
        max_file_size_mb=max_file_size_mb,
        llm_fallback_allowed=llm_fallback_allowed,
        llm_providers_configured=list(llm_keys),
    )


@router.get("/users", response_model=AdminUserListResponse)
async def list_users(
    q: str | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
):
    doc_count_subq = (
        select(Document.user_id, func.count(Document.id).label("document_count"))
        .group_by(Document.user_id)
        .subquery()
    )

    base_query = select(User, func.coalesce(doc_count_subq.c.document_count, 0)).outerjoin(
        doc_count_subq, User.id == doc_count_subq.c.user_id
    )
    count_query = select(func.count()).select_from(User)

    if q:
        search_filter = or_(User.email.ilike(f"%{q}%"), User.name.ilike(f"%{q}%"))
        base_query = base_query.where(search_filter)
        count_query = count_query.where(search_filter)

    total = await db.scalar(count_query)

    rows = (
        await db.execute(
            base_query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
        )
    ).all()

    items = [
        AdminUserListItem(
            id=user.id,
            email=user.email,
            name=user.name,
            provider=user.provider,
            is_admin=user.is_admin,
            is_suspended=user.is_suspended,
            created_at=user.created_at,
            document_count=document_count,
        )
        for user, document_count in rows
    ]
    return AdminUserListResponse(items=items, total=total, page=page, page_size=page_size)


@router.get("/users/{user_id}", response_model=AdminUserDetail)
async def get_user_detail(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(db, user_id)
    return await _build_user_detail(db, user)


@router.patch("/users/{user_id}/limits", response_model=AdminUserDetail)
async def update_user_limits(
    user_id: uuid.UUID,
    body: AdminUserLimitsUpdate,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(db, user_id)

    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    if not user_settings:
        user_settings = UserSettings(user_id=user.id)
        db.add(user_settings)

    user_settings.max_documents = body.max_documents
    user_settings.max_file_size_mb = body.max_file_size_mb
    await db.commit()
    await db.refresh(user)

    return await _build_user_detail(db, user)


@router.patch("/users/{user_id}/llm-fallback", response_model=AdminUserDetail)
async def update_user_llm_fallback(
    user_id: uuid.UUID,
    body: AdminLLMFallbackUpdate,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(db, user_id)

    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))
    if not user_settings:
        user_settings = UserSettings(user_id=user.id)
        db.add(user_settings)

    user_settings.llm_fallback_allowed = body.llm_fallback_allowed
    await db.commit()
    await db.refresh(user)

    return await _build_user_detail(db, user)


@router.post("/users/{user_id}/suspend", response_model=AdminUserDetail)
async def suspend_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신은 정지할 수 없습니다")

    user = await _get_user_or_404(db, user_id)
    user.is_suspended = True
    await db.commit()
    await db.refresh(user)
    return await _build_user_detail(db, user)


@router.post("/users/{user_id}/unsuspend", response_model=AdminUserDetail)
async def unsuspend_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    user = await _get_user_or_404(db, user_id)
    user.is_suspended = False
    await db.commit()
    await db.refresh(user)
    return await _build_user_detail(db, user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_admin: User = Depends(get_current_admin),
):
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="자기 자신은 삭제할 수 없습니다")

    user = await _get_user_or_404(db, user_id)
    docs = (await db.execute(select(Document).where(Document.user_id == user.id))).scalars().all()
    for doc in docs:
        delete_file(doc.file_key)

    await db.delete(user)
    await db.commit()


@router.get("/stats", response_model=AdminStatsResponse)
async def get_stats(db: AsyncSession = Depends(get_db)):
    since = datetime.now(UTC) - timedelta(days=7)

    total_users = await db.scalar(select(func.count()).select_from(User))
    total_documents = await db.scalar(select(func.count()).select_from(Document))
    total_storage_bytes = await db.scalar(select(func.coalesce(func.sum(Document.file_size), 0)))
    signups_last_7_days = await db.scalar(
        select(func.count()).select_from(User).where(User.created_at >= since)
    )
    new_documents_last_7_days = await db.scalar(
        select(func.count()).select_from(Document).where(Document.created_at >= since)
    )

    return AdminStatsResponse(
        total_users=total_users,
        total_documents=total_documents,
        total_storage_bytes=total_storage_bytes,
        signups_last_7_days=signups_last_7_days,
        new_documents_last_7_days=new_documents_last_7_days,
    )
