from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from app.core.deps import get_current_user
from app.models.user import User
from app.schemas.translate import TranslateRequest
from app.services.translate_service import stream_translation

router = APIRouter(tags=["translate"])


@router.post("/translate")
async def translate(
    body: TranslateRequest,
    current_user: User = Depends(get_current_user),
):
    async def event_generator():
        async for chunk in stream_translation(body.text, body.target_lang):
            yield f"data: {chunk}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
