from collections.abc import AsyncGenerator

import anthropic

from app.core.config import settings

LANG_NAMES = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Chinese",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
}


async def stream_translation(text: str, target_lang: str = "ko") -> AsyncGenerator[str, None]:
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    async with client.messages.stream(
        model="claude-haiku-4-5-20251001",
        max_tokens=2048,
        messages=[
            {
                "role": "user",
                "content": f"Translate the following text to {lang_name}. Output only the translation, no explanations:\n\n{text}",
            }
        ],
    ) as stream:
        async for text_chunk in stream.text_stream:
            yield text_chunk
