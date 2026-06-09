from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class DocumentResponse(BaseModel):
    id: UUID
    title: str
    file_key: str
    file_size: int | None
    page_count: int | None
    thumbnail_url: str | None = None
    last_opened: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}


class DocumentListResponse(BaseModel):
    items: list[DocumentResponse]
    next_cursor: str | None
    has_more: bool


class DocumentUrlResponse(BaseModel):
    url: str
    expires_in: int


class DocumentUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=500)
