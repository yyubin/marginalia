import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, field_validator

VALID_COLORS = {"yellow", "green", "blue", "pink"}


class StickyNoteCreate(BaseModel):
    page: int
    x: float
    y: float
    width: float = 20.0
    content: str = ""
    color: str = "yellow"

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if v not in VALID_COLORS:
            raise ValueError(f"color must be one of {VALID_COLORS}")
        return v


class StickyNoteUpdate(BaseModel):
    x: float | None = None
    y: float | None = None
    width: float | None = None
    content: str | None = None
    color: str | None = None

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str | None) -> str | None:
        if v is not None and v not in VALID_COLORS:
            raise ValueError(f"color must be one of {VALID_COLORS}")
        return v


class StickyNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    page: int
    x: float
    y: float
    width: float
    content: str
    color: str
    created_at: datetime
    updated_at: datetime
