from datetime import datetime

from pydantic import BaseModel, Field


class UserSettingsUpdate(BaseModel):
    highlights_per_page: int = Field(ge=10, le=500)


class LLMKeyInfo(BaseModel):
    provider: str
    key_preview: str
    updated_at: datetime

    model_config = {"from_attributes": True}


class LLMKeyUpsertRequest(BaseModel):
    api_key: str = Field(min_length=1)


class DefaultLLMProviderUpdate(BaseModel):
    provider: str | None = None


class UserSettingsResponse(BaseModel):
    highlights_per_page: int
    max_documents: int = Field(validation_alias="effective_max_documents")
    max_file_size_mb: int = Field(validation_alias="effective_max_file_size_mb")
    default_llm_provider: str | None
    llm_fallback_allowed: bool = Field(validation_alias="effective_llm_fallback_allowed")
    llm_keys: list[LLMKeyInfo]

    model_config = {"from_attributes": True, "populate_by_name": True}
