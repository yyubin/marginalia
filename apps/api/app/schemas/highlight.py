from datetime import datetime
from uuid import UUID

from pydantic import BaseModel

from app.schemas.note import NoteResponse

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
    note: NoteResponse | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
