from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, field_validator, model_validator


ToolCategory = Literal["research", "data", "quant", "backtest", "automation", "execution", "journal", "other"]
ToolPricing = Literal["free", "freemium", "paid", "open_source", "unknown"]


def clean_tags(values: list[str]) -> list[str]:
    result: list[str] = []
    for value in values:
        item = value.strip()
        if item and item not in result:
            result.append(item)
    return result[:8]


class InvestmentToolCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    url: HttpUrl
    description: str = Field(default="", max_length=800)
    category: ToolCategory = "other"
    pricing: ToolPricing = "unknown"
    tags: list[str] = Field(default_factory=list, max_length=8)
    source_url: HttpUrl | None = None
    icon_url: HttpUrl | None = Field(default=None, max_length=2048)
    starred: bool = False

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_text(cls, value: str) -> str:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, value: list[str]) -> list[str]:
        return clean_tags(value)


class InvestmentToolUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    url: HttpUrl | None = None
    description: str | None = Field(default=None, max_length=800)
    category: ToolCategory | None = None
    pricing: ToolPricing | None = None
    tags: list[str] | None = Field(default=None, max_length=8)
    source_url: HttpUrl | None = None
    icon_url: HttpUrl | None = Field(default=None, max_length=2048)
    starred: bool | None = None

    @field_validator("name", "description", mode="before")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if isinstance(value, str) else value

    @field_validator("tags")
    @classmethod
    def normalize_optional_tags(cls, value: list[str] | None) -> list[str] | None:
        return clean_tags(value) if value is not None else None

    @model_validator(mode="after")
    def reject_null_required_fields(self):
        nullable = {"source_url", "icon_url"}
        for field in self.model_fields_set - nullable:
            if getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class InvestmentToolOut(BaseModel):
    id: int
    user_id: int
    name: str
    url: str
    description: str
    category: ToolCategory
    pricing: ToolPricing
    tags: list[str]
    source_url: str | None
    icon_url: str | None = None
    starred: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
