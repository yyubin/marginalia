import logging

import redis.asyncio as aioredis

from app.core.config import settings

logger = logging.getLogger(__name__)

_client: aioredis.Redis | None = None
_memory_store: dict[str, str] = {}  # in-process fallback when REDIS_URL is not set


async def _get_client() -> aioredis.Redis | None:
    global _client
    if not settings.REDIS_URL:
        return None
    if _client is None:
        _client = aioredis.from_url(settings.REDIS_URL, decode_responses=True)
    return _client


async def redis_set(key: str, value: str, ttl_seconds: int) -> None:
    client = await _get_client()
    if client:
        await client.set(key, value, ex=ttl_seconds)
    else:
        _memory_store[key] = value


async def redis_get(key: str) -> str | None:
    client = await _get_client()
    if client:
        return await client.get(key)
    return _memory_store.get(key)


async def redis_delete(key: str) -> None:
    client = await _get_client()
    if client:
        await client.delete(key)
    else:
        _memory_store.pop(key, None)


async def redis_exists(key: str) -> bool:
    client = await _get_client()
    if client:
        return bool(await client.exists(key))
    return key in _memory_store
