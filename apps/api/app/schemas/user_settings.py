from pydantic import BaseModel, Field


class UserSettingsUpdate(BaseModel):
    highlights_per_page: int = Field(ge=10, le=500)


class UserSettingsResponse(BaseModel):
    highlights_per_page: int

    model_config = {"from_attributes": True}
