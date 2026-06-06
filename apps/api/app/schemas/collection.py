from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.highlight import HighlightResponse


class CollectionItemAdd(BaseModel):
    highlight_id: UUID


class CollectionItemReorder(BaseModel):
    items: list[dict]  # [{ id: UUID, position: int }]


class CollectionItemResponse(BaseModel):
    id: UUID
    highlight_id: UUID
    position: int
    highlight: HighlightResponse

    model_config = {"from_attributes": True}


class CollectionResponse(BaseModel):
    id: UUID
    document_id: UUID
    name: str
    items: list[CollectionItemResponse]
    created_at: datetime

    model_config = {"from_attributes": True}
