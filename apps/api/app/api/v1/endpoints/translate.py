from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.translate import TranslateRequest
from app.services.translate_service import resolve_translation_credentials

router = APIRouter(tags=["translate"])


@router.post("/translate")
async def translate(
    body: TranslateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    resolved = await resolve_translation_credentials(db, current_user)
    if resolved is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="번역 기능을 사용하려면 설정에서 LLM API 키를 등록해주세요",
        )
    provider, api_key = resolved

    async def event_generator():
        async for chunk in provider.stream_translate(api_key, body.text, body.target_lang):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
