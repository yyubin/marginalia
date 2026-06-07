from collections.abc import AsyncGenerator

import anthropic

from app.services.llm_providers.base import LLMProvider, build_translation_prompt


class AnthropicProvider(LLMProvider):
    name = "anthropic"

    def __init__(self, model: str = "claude-haiku-4-5-20251001"):
        self.model = model

    async def validate_key(self, api_key: str) -> bool:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        try:
            await client.models.list(limit=1)
            return True
        except anthropic.AuthenticationError:
            return False

    async def stream_translate(
        self,
        api_key: str,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
    ) -> AsyncGenerator[str, None]:
        client = anthropic.AsyncAnthropic(api_key=api_key)
        async with client.messages.stream(
            model=self.model,
            max_tokens=2048,
            messages=[{"role": "user", "content": build_translation_prompt(text, target_lang, source_lang)}],
        ) as stream:
            async for chunk in stream.text_stream:
                yield chunk
