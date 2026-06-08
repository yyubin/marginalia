from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import encrypt_secret, mask_key
from app.core.database import get_db
from app.core.deps import get_current_user
from app.core.rate_limit import limiter
from app.core.redis_client import redis_delete, redis_get, redis_set
from app.models.user import User
from app.models.user_llm_key import UserLLMKey
from app.models.user_settings import UserSettings
from app.schemas.user_settings import (
    DefaultLLMProviderUpdate,
    LLMKeyInfo,
    LLMKeyUpsertRequest,
    UserSettingsResponse,
    UserSettingsUpdate,
)
from app.services.llm_providers import SUPPORTED_PROVIDERS, get_provider

router = APIRouter(tags=["settings"])

_SETTINGS_TTL = 3600


def _settings_cache_key(user_id) -> str:
    return f"settings:{user_id}"


async def _invalidate_settings_cache(user_id) -> None:
    await redis_delete(_settings_cache_key(user_id))


async def _get_or_create_settings(db: AsyncSession, user_id) -> UserSettings:
    result = await db.execute(select(UserSettings).where(UserSettings.user_id == user_id))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = UserSettings(user_id=user_id)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


async def _get_llm_keys(db: AsyncSession, user_id) -> list[UserLLMKey]:
    result = await db.execute(select(UserLLMKey).where(UserLLMKey.user_id == user_id))
    return list(result.scalars().all())


def _build_settings_response(user_settings: UserSettings, llm_keys: list[UserLLMKey]) -> UserSettingsResponse:
    return UserSettingsResponse(
        highlights_per_page=user_settings.highlights_per_page,
        max_documents=user_settings.effective_max_documents,
        max_file_size_mb=user_settings.effective_max_file_size_mb,
        default_llm_provider=user_settings.default_llm_provider,
        llm_fallback_allowed=user_settings.effective_llm_fallback_allowed,
        llm_keys=[LLMKeyInfo.model_validate(key) for key in llm_keys],
    )


def _require_supported_provider(provider: str) -> None:
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 provider입니다. 지원 목록: {', '.join(SUPPORTED_PROVIDERS)}",
        )


@router.get("/settings", response_model=UserSettingsResponse)
async def get_settings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cache_key = _settings_cache_key(current_user.id)
    cached = await redis_get(cache_key)
    if cached:
        return UserSettingsResponse.model_validate_json(cached)

    user_settings = await _get_or_create_settings(db, current_user.id)
    llm_keys = await _get_llm_keys(db, current_user.id)
    response = _build_settings_response(user_settings, llm_keys)
    await redis_set(cache_key, response.model_dump_json(), ttl_seconds=_SETTINGS_TTL)
    return response


@router.patch("/settings", response_model=UserSettingsResponse)
async def update_settings(
    body: UserSettingsUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_settings = await _get_or_create_settings(db, current_user.id)
    user_settings.highlights_per_page = body.highlights_per_page
    await db.commit()
    await db.refresh(user_settings)
    llm_keys = await _get_llm_keys(db, current_user.id)
    response = _build_settings_response(user_settings, llm_keys)
    await _invalidate_settings_cache(current_user.id)
    return response


@router.put("/settings/llm-provider", response_model=UserSettingsResponse)
async def update_default_llm_provider(
    body: DefaultLLMProviderUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.provider is not None:
        _require_supported_provider(body.provider)

    user_settings = await _get_or_create_settings(db, current_user.id)
    user_settings.default_llm_provider = body.provider
    await db.commit()
    await db.refresh(user_settings)
    llm_keys = await _get_llm_keys(db, current_user.id)
    response = _build_settings_response(user_settings, llm_keys)
    await _invalidate_settings_cache(current_user.id)
    return response


@router.put("/settings/llm-keys/{provider}", response_model=LLMKeyInfo)
@limiter.limit("5/minute")
async def upsert_llm_key(
    request: Request,
    provider: str,
    body: LLMKeyUpsertRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_supported_provider(provider)

    adapter = get_provider(provider)
    is_valid = await adapter.validate_key(body.api_key)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="유효하지 않은 API 키입니다",
        )

    key_row = await db.scalar(
        select(UserLLMKey).where(UserLLMKey.user_id == current_user.id, UserLLMKey.provider == provider)
    )
    if not key_row:
        key_row = UserLLMKey(user_id=current_user.id, provider=provider)
        db.add(key_row)

    key_row.encrypted_key = encrypt_secret(body.api_key)
    key_row.key_preview = mask_key(body.api_key)
    await db.commit()
    await db.refresh(key_row)
    await _invalidate_settings_cache(current_user.id)
    return key_row


@router.delete("/settings/llm-keys/{provider}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_llm_key(
    provider: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _require_supported_provider(provider)

    key_row = await db.scalar(
        select(UserLLMKey).where(UserLLMKey.user_id == current_user.id, UserLLMKey.provider == provider)
    )
    if not key_row:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="등록된 키가 없습니다")

    await db.delete(key_row)
    await db.commit()
    await _invalidate_settings_cache(current_user.id)
