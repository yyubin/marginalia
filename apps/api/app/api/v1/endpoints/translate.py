import json

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.translate import TranslateRequest
from app.services.translate_service import resolve_translation_credentials
from app.services.llm_providers import SUPPORTED_PROVIDERS

router = APIRouter(tags=["translate"])


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n"


@router.post("/translate")
async def translate(
    body: TranslateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if body.provider is not None and body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"지원하지 않는 provider입니다. 지원 목록: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    resolved = await resolve_translation_credentials(db, current_user, body.provider)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="번역 기능을 사용하려면 설정에서 LLM API 키를 등록해주세요",
        )
    provider, api_key, key_source = resolved

    async def event_generator():
        yield _sse("meta", {
            "provider": provider.name,
            "model": getattr(provider, "model", None),
            "key_source": key_source,
            "target_lang": body.target_lang,
        })
        try:
            async for chunk in provider.stream_translate(
                api_key,
                body.text,
                body.target_lang,
                body.source_lang,
            ):
                yield _sse("delta", {"text": chunk})
            yield _sse("done", {})
        except Exception:
            yield _sse("error", {
                "code": "provider_error",
                "message": "번역 중 오류가 발생했습니다",
            })

    return StreamingResponse(event_generator(), media_type="text/event-stream")
