from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

VALID_COLORS = {"yellow", "green", "blue", "pink", "purple"}


class HighlightCreate(BaseModel):
    position: dict
    content: dict
    color: str = "yellow"


class HighlightColorUpdate(BaseModel):
    color: str


class HighlightResponse(BaseModel):
    id: UUID
    document_id: UUID
    position: dict
    content: dict
    color: str
    created_at: datetime

    model_config = {"from_attributes": True}
