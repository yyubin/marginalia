from app.services.llm_providers.anthropic_provider import AnthropicProvider
from app.services.llm_providers.base import LLMProvider
from app.services.llm_providers.google_provider import GoogleProvider
from app.services.llm_providers.openai_provider import OpenAIProvider

PROVIDERS: dict[str, LLMProvider] = {
    "anthropic": AnthropicProvider(),
    "openai": OpenAIProvider(),
    "google": GoogleProvider(),
}

SUPPORTED_PROVIDERS = list(PROVIDERS.keys())


def get_provider(name: str) -> LLMProvider:
    try:
        return PROVIDERS[name]
    except KeyError:
        raise ValueError(f"unsupported provider: {name}") from None


__all__ = ["LLMProvider", "PROVIDERS", "SUPPORTED_PROVIDERS", "get_provider"]
