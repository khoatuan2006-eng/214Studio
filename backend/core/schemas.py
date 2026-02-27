"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel, Field
from typing import Any, Optional


class ProjectCreate(BaseModel):
    name: str = Field(default="Untitled Project")
    description: str = Field(default="")
    canvas_width: int = Field(default=1920)
    canvas_height: int = Field(default=1080)
    fps: int = Field(default=24)
    data: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    canvas_width: Optional[int] = None
    canvas_height: Optional[int] = None
    fps: Optional[int] = None
    data: Optional[dict[str, Any]] = None


class AutoSaveRequest(BaseModel):
    data: dict[str, Any]
