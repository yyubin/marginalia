from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import decrypt_secret
from app.models.user import User
from app.models.user_llm_key import UserLLMKey
from app.models.user_settings import UserSettings
from app.services.llm_providers import LLMProvider, get_provider

SERVER_FALLBACK_PROVIDER = "anthropic"


async def resolve_translation_credentials(db: AsyncSession, user: User) -> tuple[LLMProvider, str] | None:
    """Resolves which LLM provider + API key a translation request should use.

    Returns (provider, api_key). Returns None if the user has no key registered
    for their chosen provider and is not allowed to fall back to the server's
    shared key (in which case the caller should reject the request).
    """
    user_settings = await db.scalar(select(UserSettings).where(UserSettings.user_id == user.id))

    provider_name = SERVER_FALLBACK_PROVIDER
    if user_settings and user_settings.default_llm_provider:
        provider_name = user_settings.default_llm_provider

    user_key = await db.scalar(
        select(UserLLMKey).where(UserLLMKey.user_id == user.id, UserLLMKey.provider == provider_name)
    )
    if user_key:
        return get_provider(provider_name), decrypt_secret(user_key.encrypted_key)

    fallback_allowed = (
        user_settings.effective_llm_fallback_allowed
        if user_settings is not None
        else settings.DEFAULT_LLM_FALLBACK_ALLOWED
    )
    if not fallback_allowed:
        return None

    return get_provider(SERVER_FALLBACK_PROVIDER), settings.ANTHROPIC_API_KEY
