from pydantic import BaseModel
from datetime import datetime


class TagCreate(BaseModel):
    name: str
    color: str = "#6366f1"


class TagUpdate(BaseModel):
    name: str | None = None
    color: str | None = None


class TagOut(BaseModel):
    id: int
    name: str
    color: str
    created_at: datetime
    asset_count: int = 0

    model_config = {"from_attributes": True}


class TagBrief(BaseModel):
    """资产列表中嵌入的精简标签"""
    id: int
    name: str
    color: str

    model_config = {"from_attributes": True}