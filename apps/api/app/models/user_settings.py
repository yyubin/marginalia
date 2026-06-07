import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import settings
from app.core.database import Base


class UserSettings(Base):
    __tablename__ = "user_settings"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    highlights_per_page: Mapped[int] = mapped_column(Integer, default=50, server_default="50")
    max_documents: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_file_size_mb: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_llm_provider: Mapped[str | None] = mapped_column(String, nullable=True)
    llm_fallback_allowed: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    @property
    def effective_max_documents(self) -> int:
        return self.max_documents if self.max_documents is not None else settings.MAX_DOCUMENTS_PER_USER

    @property
    def effective_max_file_size_mb(self) -> int:
        return self.max_file_size_mb if self.max_file_size_mb is not None else settings.MAX_FILE_SIZE_MB

    @property
    def effective_llm_fallback_allowed(self) -> bool:
        return (
            self.llm_fallback_allowed
            if self.llm_fallback_allowed is not None
            else settings.DEFAULT_LLM_FALLBACK_ALLOWED
        )
