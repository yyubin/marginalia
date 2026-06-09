import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query, Request, Response
from sqlalchemy import Integer, cast, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.constants import ANNOTATIONS_PAGE_SIZE
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.core.redis_client import redis_get, redis_set
from app.models.drawing_stroke import DrawingStroke
from app.models.highlight import Highlight
from app.models.sticky_note import StickyNote
from app.schemas.document import DocumentUrlResponse
from app.schemas.share import (
    SharedDocumentMeta,
    SharedDrawingStrokeResponse,
    SharedHighlightResponse,
    SharedStickyNoteResponse,
)
from app.services.r2_service import generate_presigned_url
from app.services.share_service import (
    SHARE_PRESIGNED_TTL,
    resolve_share,
    share_url_cache_key,
)

router = APIRouter(prefix="/share", tags=["share"])

# Cache the presigned URL slightly under its real expiry, leaving a safety buffer.
_PRESIGNED_CACHE_TTL = SHARE_PRESIGNED_TTL - 120


@router.get("/{token}", response_model=SharedDocumentMeta)
@limiter.limit("60/minute")
async def get_shared_meta(
    request: Request,
    response: Response,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    share, doc = await resolve_share(db, token)
    share.view_count += 1
    share.last_viewed_at = datetime.now(UTC)
    await db.commit()
    return SharedDocumentMeta(title=doc.title, page_count=doc.page_count)


@router.get("/{token}/url", response_model=DocumentUrlResponse)
@limiter.limit("60/minute")
async def get_shared_url(
    request: Request,
    response: Response,
    token: str,
    db: AsyncSession = Depends(get_db),
):
    _, doc = await resolve_share(db, token)

    cache_key = share_url_cache_key(token)
    cached_url = await redis_get(cache_key)
    if cached_url:
        return DocumentUrlResponse(url=cached_url, expires_in=_PRESIGNED_CACHE_TTL)

    url = generate_presigned_url(doc.file_key, SHARE_PRESIGNED_TTL)
    await redis_set(cache_key, url, ttl_seconds=_PRESIGNED_CACHE_TTL)
    return DocumentUrlResponse(url=url, expires_in=SHARE_PRESIGNED_TTL)


@router.get("/{token}/highlights", response_model=list[SharedHighlightResponse])
@limiter.limit("60/minute")
async def list_shared_highlights(
    request: Request,
    response: Response,
    token: str,
    pdf_page_from: int = Query(default=1, ge=1),
    limit: int = Query(default=50, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    share, doc = await resolve_share(db, token)
    page_col = cast(Highlight.position["pageNumber"].astext, Integer)
    result = await db.execute(
        select(Highlight)
        .where(
            Highlight.document_id == doc.id,
            Highlight.user_id == share.user_id,
            page_col >= pdf_page_from,
        )
        .order_by(page_col, Highlight.created_at)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{token}/sticky-notes", response_model=list[SharedStickyNoteResponse])
@limiter.limit("60/minute")
async def list_shared_sticky_notes(
    request: Request,
    response: Response,
    token: str,
    page_from: int = Query(default=1, ge=1),
    limit: int = Query(default=ANNOTATIONS_PAGE_SIZE, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    share, doc = await resolve_share(db, token)
    result = await db.execute(
        select(StickyNote)
        .where(
            StickyNote.document_id == doc.id,
            StickyNote.user_id == share.user_id,
            StickyNote.page >= page_from,
        )
        .order_by(StickyNote.page, StickyNote.created_at)
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{token}/drawings", response_model=list[SharedDrawingStrokeResponse])
@limiter.limit("60/minute")
async def list_shared_drawings(
    request: Request,
    response: Response,
    token: str,
    page_from: int = Query(default=1, ge=1),
    limit: int = Query(default=ANNOTATIONS_PAGE_SIZE, ge=1, le=500),
    db: AsyncSession = Depends(get_db),
):
    share, doc = await resolve_share(db, token)
    result = await db.execute(
        select(DrawingStroke)
        .where(
            DrawingStroke.document_id == doc.id,
            DrawingStroke.user_id == share.user_id,
            DrawingStroke.page >= page_from,
        )
        .order_by(DrawingStroke.page, DrawingStroke.created_at)
        .limit(limit)
    )
    return result.scalars().all()
