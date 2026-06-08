import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_verified_user
from app.core.rate_limit import limiter
from app.models.document import Document
from app.models.user import User
from app.models.user_settings import UserSettings
from app.schemas.document import DocumentResponse, DocumentUrlResponse
from app.services.r2_service import delete_file, generate_presigned_url, upload_file

router = APIRouter(prefix="/documents", tags=["documents"])


@router.get("", response_model=list[DocumentResponse])
async def list_documents(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(Document).where(Document.user_id == current_user.id).order_by(Document.created_at.desc())
    )
    return result.scalars().all()


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

    file_key = f"{current_user.id}/{uuid.uuid4()}.pdf"
    upload_file(file_bytes, file_key)

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
    delete_file(doc.file_key)
    await db.delete(doc)
    await db.commit()


@router.get("/{doc_id}/url", response_model=DocumentUrlResponse)
async def get_document_url(
    doc_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    doc = await _get_owned_doc(db, doc_id, current_user.id)

    # 마지막 열람 시각 갱신
    doc.last_opened = datetime.now(UTC)
    await db.commit()

    expires_in = 3600
    url = generate_presigned_url(doc.file_key, expires_in)
    return DocumentUrlResponse(url=url, expires_in=expires_in)


async def _get_owned_doc(db: AsyncSession, doc_id: uuid.UUID, user_id: uuid.UUID) -> Document:
    result = await db.execute(
        select(Document).where(Document.id == doc_id, Document.user_id == user_id)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return doc
