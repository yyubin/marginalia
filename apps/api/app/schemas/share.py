import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict


# ── Management (owner, authenticated) ────────────────────────────────────────
class ShareCreateRequest(BaseModel):
    document_id: uuid.UUID


class ShareEnableRequest(BaseModel):
    is_enabled: bool


class ShareInfo(BaseModel):
    """Owner-facing view of their share. Safe to return the token here — it's
    the owner's own capability link, shown so they can copy/share it."""

    document_id: uuid.UUID
    title: str
    token: str
    share_url: str
    is_enabled: bool
    view_count: int
    last_viewed_at: datetime | None
    created_at: datetime


# ── Public (anonymous viewer) ────────────────────────────────────────────────
# Deliberately omit user_id / document_id and any private fields (e.g. notes).
class SharedDocumentMeta(BaseModel):
    title: str
    page_count: int | None


class SharedHighlightResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    position: dict
    content: dict
    color: str
    created_at: datetime


class SharedStickyNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    page: int
    x: float
    y: float
    width: float
    content: str
    color: str
    created_at: datetime


class SharedDrawingStrokeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    page: int
    points: list[list[float]]
    color: str
    width: float
    tool: str
    created_at: datetime
