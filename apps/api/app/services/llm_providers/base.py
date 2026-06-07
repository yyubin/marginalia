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


def build_translation_prompt(text: str, target_lang: str) -> str:
    lang_name = LANG_NAMES.get(target_lang, target_lang)
    return (
        f"Translate the following text to {lang_name}. "
        f"Output only the translation, no explanations:\n\n{text}"
    )


class LLMProvider(ABC):
    name: str

    @abstractmethod
    async def validate_key(self, api_key: str) -> bool:
        """Returns False if the key is rejected by the provider as invalid/unauthorized."""

    @abstractmethod
    def stream_translate(self, api_key: str, text: str, target_lang: str) -> AsyncGenerator[str, None]:
        """Yields translated text chunks for streaming to the client."""
