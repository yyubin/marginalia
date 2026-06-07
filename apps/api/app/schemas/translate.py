from pydantic import BaseModel, Field


class TranslateRequest(BaseModel):
    text: str = Field(min_length=1, max_length=8000)
    target_lang: str = "ko"
    source_lang: str = "auto"
    provider: str | None = None
