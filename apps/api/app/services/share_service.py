import secrets
import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.core.config import settings
from app.core.redis_client import redis_delete
from app.models.document import Document
from app.models.document_share import DocumentShare
from app.models.user import User

# Presigned URL TTL for public viewers. Kept short (30 min) so that disabling a
# share narrows the window in which an already-handed-out URL stays valid.
SHARE_PRESIGNED_TTL = 1800


def generate_share_token() -> str:
    return secrets.token_urlsafe(16)


def build_share_url(token: str) -> str:
    return f"{settings.WEB_BASE_URL.rstrip('/')}/share/{token}"


def share_url_cache_key(token: str) -> str:
    return f"share_url:{token}"


async def invalidate_share_url_cache(token: str) -> None:
    await redis_delete(share_url_cache_key(token))


async def resolve_share(db: AsyncSession, token: str) -> tuple[DocumentShare, Document]:
    """Resolve a public share token to its (share, document). Raises 404 for any
    reason a viewer shouldn't see it: unknown token, disabled, owner suspended.
    Deliberately uses 404 (not 403) everywhere to avoid leaking existence."""
    share = await db.scalar(
        select(DocumentShare)
        .options(joinedload(DocumentShare.document))
        .where(DocumentShare.token == token)
    )
    if not share or not share.is_enabled or share.document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공유를 찾을 수 없습니다")

    owner = await db.get(User, share.user_id)
    if not owner or owner.is_suspended:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="공유를 찾을 수 없습니다")

    return share, share.document
