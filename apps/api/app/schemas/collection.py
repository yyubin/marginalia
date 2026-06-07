from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.highlight import HighlightResponse


class CollectionItemAdd(BaseModel):
    highlight_id: UUID


class CollectionItemPosition(BaseModel):
    id: UUID
    position: int = Field(ge=1)


class CollectionItemReorder(BaseModel):
    items: list[CollectionItemPosition]


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
