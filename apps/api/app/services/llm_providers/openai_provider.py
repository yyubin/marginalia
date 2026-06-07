from collections.abc import AsyncGenerator

import openai
from openai import AsyncOpenAI

from app.services.llm_providers.base import LLMProvider, build_translation_prompt


class OpenAIProvider(LLMProvider):
    name = "openai"

    def __init__(self, model: str = "gpt-4o-mini"):
        self.model = model

    async def validate_key(self, api_key: str) -> bool:
        client = AsyncOpenAI(api_key=api_key)
        try:
            await client.models.list()
            return True
        except openai.AuthenticationError:
            return False

    async def stream_translate(self, api_key: str, text: str, target_lang: str) -> AsyncGenerator[str, None]:
        client = AsyncOpenAI(api_key=api_key)
        stream = await client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": build_translation_prompt(text, target_lang)}],
            stream=True,
        )
        async for chunk in stream:
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta
