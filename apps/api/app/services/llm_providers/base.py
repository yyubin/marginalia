from abc import ABC, abstractmethod
from collections.abc import AsyncGenerator

LANG_NAMES = {
    "ko": "Korean",
    "en": "English",
    "ja": "Japanese",
    "zh": "Chinese",
    "fr": "French",
    "de": "German",
    "es": "Spanish",
}


def build_translation_prompt(text: str, target_lang: str, source_lang: str = "auto") -> str:
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    source = "the detected source language" if source_lang == "auto" else LANG_NAMES.get(source_lang, source_lang)
    return (
        f"Translate the following text from {source} to {lang_name}. "
        "Preserve meaning, tone, paragraph breaks, and technical terms. "
        f"Output only the translation, no explanations:\n\n{text}"
    )


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def validate_key(self, api_key: str) -> bool:
        """Returns False if the key is rejected by the provider as invalid/unauthorized."""

    @abstractmethod
    def stream_translate(
        self,
        api_key: str,
        text: str,
        target_lang: str,
        source_lang: str = "auto",
    ) -> AsyncGenerator[str, None]:
        """Yields translated text chunks for streaming to the client."""
