from pydantic import BaseModel, Field


class UserSettingsUpdate(BaseModel):
    highlights_per_page: int = Field(ge=10, le=500)


class UserSettingsResponse(BaseModel):
    highlights_per_page: int
    max_documents: int = Field(validation_alias="effective_max_documents")
    max_file_size_mb: int = Field(validation_alias="effective_max_file_size_mb")

    model_config = {"from_attributes": True, "populate_by_name": True}
