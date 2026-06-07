from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class AdminUserListItem(BaseModel):
    id: UUID
    email: str
    name: str | None
    provider: str
    is_admin: bool
    is_suspended: bool
    created_at: datetime
    document_count: int

    model_config = {"from_attributes": True}


class AdminUserListResponse(BaseModel):
    items: list[AdminUserListItem]
    total: int
    page: int
    page_size: int


class AdminDocumentSummary(BaseModel):
    id: UUID
    title: str
    file_size: int | None
    page_count: int | None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminUserDetail(BaseModel):
    id: UUID
    email: str
    name: str | None
    provider: str
    is_admin: bool
    is_suspended: bool
    created_at: datetime
    documents: list[AdminDocumentSummary]
    total_storage_bytes: int
    max_documents: int
    max_file_size_mb: int
    llm_fallback_allowed: bool
    llm_providers_configured: list[str]


class AdminUserLimitsUpdate(BaseModel):
    # null clears the override and falls back to the global default
    max_documents: int | None = Field(ge=1, le=1000)
    max_file_size_mb: int | None = Field(ge=1, le=2000)


class AdminLLMFallbackUpdate(BaseModel):
    # null clears the override and falls back to the global default
    llm_fallback_allowed: bool | None = None


class AdminStatsResponse(BaseModel):
    total_users: int
    total_documents: int
    total_storage_bytes: int
    signups_last_7_days: int
    new_documents_last_7_days: int
