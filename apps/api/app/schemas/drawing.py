import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

VALID_COLORS = {"black", "red", "orange", "yellow", "green", "blue", "purple"}
VALID_TOOLS = {"pen", "highlighter"}
MAX_POINTS_PER_STROKE = 1000


class DrawingStrokeCreate(BaseModel):
    page: int = Field(ge=1)
    points: list[list[float]]
    color: str = "black"
    width: float = Field(default=2.0, ge=1.0, le=24.0)
    tool: str = "pen"

    @field_validator("color")
    @classmethod
    def validate_color(cls, v: str) -> str:
        if v not in VALID_COLORS:
            raise ValueError(f"color must be one of {VALID_COLORS}")
        return v

    @field_validator("tool")
    @classmethod
    def validate_tool(cls, v: str) -> str:
        if v not in VALID_TOOLS:
            raise ValueError(f"tool must be one of {VALID_TOOLS}")
        return v

    @field_validator("points")
    @classmethod
    def validate_points(cls, v: list[list[float]]) -> list[list[float]]:
        if not v:
            raise ValueError("points must not be empty")
        if len(v) > MAX_POINTS_PER_STROKE:
            raise ValueError(f"points length must be <= {MAX_POINTS_PER_STROKE}")
        for p in v:
            if len(p) < 2 or len(p) > 3:
                raise ValueError("each point must be [x, y] or [x, y, pressure]")
            x, y = p[0], p[1]
            if not (0.0 <= x <= 100.0) or not (0.0 <= y <= 100.0):
                raise ValueError("x, y must be in [0, 100]")
            if len(p) == 3 and not (0.0 <= p[2] <= 1.0):
                raise ValueError("pressure must be in [0, 1]")
        return v


class DrawingStrokeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    document_id: uuid.UUID
    user_id: uuid.UUID
    page: int
    points: list[list[float]]
    color: str
    width: float
    tool: str
    created_at: datetime


class SharedDrawingStrokeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    page: int
    points: list[list[float]]
    color: str
    width: float
    tool: str
