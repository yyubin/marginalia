from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class SearchResultItem(BaseModel):
    type: Literal["highlight", "note"]
    id: UUID
    document_id: UUID
    document_title: str
    content_text: str
    color: str | None
    highlight_id: UUID | None
    created_at: datetime


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
    has_more: bool
