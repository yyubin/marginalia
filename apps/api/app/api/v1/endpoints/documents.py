import base64
import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile, status
from sqlalchemy import func, select, tuple_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_verified_user
from app.core.rate_limit import limiter
from app.models.document import Document
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.document import DocumentListResponse, DocumentResponse, DocumentUrlResponse
from app.core.redis_client import redis_delete, redis_get, redis_set
from app.services.r2_service import delete_file_async, generate_presigned_url, upload_file_async

router = APIRouter(prefix="/documents", tags=["documents"])

_PRESIGNED_TTL = 3300  # 55 min — R2 URL expires in 60 min, 5 min safety buffer


def _presigned_cache_key(doc_id: uuid.UUID) -> str:
    return f"presigned_url:{doc_id}"


def _encode_cursor(created_at: datetime, doc_id: uuid.UUID) -> str:
    raw = f"{created_at.isoformat()}:{doc_id}"
    return base64.urlsafe_b64encode(raw.encode()).decode()


def _decode_cursor(cursor: str) -> tuple[datetime, uuid.UUID]:
    try:
        raw = base64.urlsafe_b64decode(cursor.encode()).decode()
        ts_str, id_str = raw.rsplit(":", 1)
        return datetime.fromisoformat(ts_str), uuid.UUID(id_str)
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid cursor")


@router.get("", response_model=DocumentListResponse)
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
    limit: int = Query(default=20, ge=1, le=100),
    cursor: str | None = Query(default=None),
):
    stmt = select(Document).where(Document.user_id == current_user.id)

    if cursor:
        cursor_ts, cursor_id = _decode_cursor(cursor)
        stmt = stmt.where(
            tuple_(Document.created_at, Document.id) < (cursor_ts, cursor_id)
        )

    stmt = stmt.order_by(Document.created_at.desc(), Document.id.desc()).limit(limit + 1)
    result = await db.execute(stmt)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = _encode_cursor(items[-1].created_at, items[-1].id) if has_more else None

    return DocumentListResponse(items=items, next_cursor=next_cursor, has_more=has_more)


@router.post("", response_model=DocumentResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("20/hour")
async def upload_document(
    request: Request,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_verified_user),
):
    if file.content_type != "application/pdf":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="PDF 파일만 업로드할 수 있습니다")

    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == current_user.id))
    max_documents = user_settings.effective_max_documents if user_settings else settings.MAX_DOCUMENTS_PER_USER
    max_file_size_mb = user_settings.effective_max_file_size_mb if user_settings else settings.MAX_FILE_SIZE_MB

    count = await db.scalar(select(func.count()).select_from(Document).where(Document.user_id == current_user.id))
    if count >= max_documents:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"최대 {max_documents}개의 PDF만 저장할 수 있습니다",
        )

    max_bytes = max_file_size_mb * 1024 * 1024
    file_bytes = await file.read()
    if len(file_bytes) > max_bytes:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"파일 크기는 {max_file_size_mb}MB 이하여야 합니다",
        )

    if not file_bytes.startswith(b"%PDF-"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="유효하지 않은 PDF 파일입니다")

    file_key = f"{current_user.id}/{uuid.uuid4()}.pdf"
    await upload_file_async(file_bytes, file_key)

    doc = Document(
        user_id=current_user.id,
        title=file.filename or "Untitled",
        file_key=file_key,
        file_size=len(file_bytes),
    )
    db.add(doc)
    await db.commit()
    await db.refresh(doc)
    return doc


@router.get("/{doc_id}", response_model=DocumentResponse)
async def get_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(db, doc_id, current_user.id)
    return doc


@router.delete("/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_document(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(db, doc_id, current_user.id)
    await redis_delete(_presigned_cache_key(doc_id))
    await delete_file_async(doc.file_key)
    await db.delete(doc)
    await db.commit()


@router.get("/{doc_id}/url", response_model=DocumentUrlResponse)
async def get_document_url(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(db, doc_id, current_user.id)

    doc.last_opened = datetime.now(UTC)
    await db.commit()

    cache_key = _presigned_cache_key(doc_id)
    cached_url = await redis_get(cache_key)
    if cached_url:
        return DocumentUrlResponse(url=cached_url, expires_in=_PRESIGNED_TTL)

    url = generate_presigned_url(doc.file_key, 3600)
    await redis_set(cache_key, url, ttl_seconds=_PRESIGNED_TTL)
    return DocumentUrlResponse(url=url, expires_in=3600)


async def _get_owned_doc(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc
