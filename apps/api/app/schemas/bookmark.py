from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class BookmarkCreate(BaseModel):
    page: int
    label: str | None = None


class BookmarkUpdate(BaseModel):
    label: str | None = None


class BookmarkResponse(BaseModel):
    id: UUID
    document_id: UUID
    page: int
    label: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
