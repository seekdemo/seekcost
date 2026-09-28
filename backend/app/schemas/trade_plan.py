"""交易计划 — 请求/响应模型"""
from pydantic import BaseModel
from datetime import datetime
from app.models.trade_plan import PlanStatus


class TradePlanCreate(BaseModel):
    asset_id: int
    target_position: float = 0
    max_position: float = 0
    build_low: float | None = None
    build_high: float | None = None
    stop_loss: float | None = None
    take_profit_1: float | None = None
    take_profit_2: float | None = None
    take_profit_3: float | None = None
    support_1: float | None = None
    support_2: float | None = None
    resistance_1: float | None = None
    resistance_2: float | None = None
    buy_strategy: str | None = None
    sell_strategy: str | None = None
    note: str | None = None


class TradePlanUpdate(BaseModel):
    status: PlanStatus | None = None
    target_position: float | None = None
    max_position: float | None = None
    build_low: float | None = None
    build_high: float | None = None
    stop_loss: float | None = None
    take_profit_1: float | None = None
    take_profit_2: float | None = None
    take_profit_3: float | None = None
    support_1: float | None = None
    support_2: float | None = None
    resistance_1: float | None = None
    resistance_2: float | None = None
    buy_strategy: str | None = None
    sell_strategy: str | None = None
    note: str | None = None


class TradePlanOut(BaseModel):
    id: int
    asset_id: int
    status: PlanStatus
    target_position: float
    max_position: float
    build_low: float | None
    build_high: float | None
    stop_loss: float | None
    take_profit_1: float | None
    take_profit_2: float | None
    take_profit_3: float | None
    support_1: float | None
    support_2: float | None
    resistance_1: float | None
    resistance_2: float | None
    buy_strategy: str | None
    sell_strategy: str | None
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}