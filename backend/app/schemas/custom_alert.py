from typing import Literal
from pydantic import BaseModel, Field, field_validator, model_validator


class AlertRuleWrite(BaseModel):
    stock_id: int | None = Field(default=None, gt=0)
    scope: Literal["single", "watchlist"] = "single"
    name: str = Field(min_length=1, max_length=100)
    period: int = Field(ge=2, le=250)
    tolerance: float = Field(ge=0.1, le=20, allow_inf_nan=False)
    side: Literal["both", "above", "below"] = "both"
    cooldown_minutes: int = Field(default=1440, ge=5, le=10080)
    enabled: bool = True

    @model_validator(mode="after")
    def validate_target(self):
        if self.scope == "single" and self.stock_id is None:
            raise ValueError("单只股票规则必须选择标的")
        if self.scope == "watchlist":
            self.stock_id = None
        return self

    @field_validator("name")
    @classmethod
    def trim_name(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("请输入规则名称")
        return value
