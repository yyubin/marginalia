from collections.abc import AsyncGenerator

from google import genai
from google.genai import errors

from app.services.llm_providers.base import LLMProvider, build_translation_prompt


class GoogleProvider(LLMProvider):
    name = "google"

    def __init__(self, model: str = "gemini-2.0-flash"):
        self.model = model

    async def validate_key(self, api_key: str) -> bool:
        client = genai.Client(api_key=api_key)
        try:
            await client.aio.models.list(config={"page_size": 1})
            return True
        except errors.ClientError as exc:
            if exc.status in (400, 401, 403):
                return False
            raise

    async def stream_translate(
        self,
        api_key: str,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
    ) -> AsyncGenerator[str, None]:
        client = genai.Client(api_key=api_key)
        stream = await client.aio.models.generate_content_stream(
            model=self.model,
            contents=build_translation_prompt(text, target_lang, source_lang),
        )
        async for chunk in stream:
            if chunk.text:
                yield chunk.text
