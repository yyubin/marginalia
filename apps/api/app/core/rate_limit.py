from fastapi import Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.core.config import settings
from app.core.security import decode_token


def get_user_id_or_ip(request: Request) -> str:
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        user_id = decode_token(auth[7:])
        if user_id:
            return f"user:{user_id}"
    return get_remote_address(request)


limiter = Limiter(
    key_func=get_user_id_or_ip,
    default_limits=["120/minute"],
    headers_enabled=True,
    storage_uri=settings.RATE_LIMIT_STORAGE_URI or "memory://",
    enabled=settings.RATE_LIMIT_ENABLED,
    in_memory_fallback_enabled=bool(settings.RATE_LIMIT_STORAGE_URI),
    in_memory_fallback=["120/minute"],
)


async def rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={"detail": "요청 한도를 초과했습니다. 잠시 후 다시 시도해 주세요."},
    )
