"""Typed API contracts for private quant plugins."""
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field



QuantSignal = Literal[
    "entry_breakout",
    "entry_pullback",
    "risk_exit",
    "hold_trend",
    "trend_warning",
    "watch",
    "needs_qualification",
    "not_eligible",
    "insufficient_data",
    "provider_error",
    "volume_observation",
    "anchor_strike_zone",
    "anchor_fair_zone",
    "anchor_target_zone",
    "anchor_risk",
    "market_baseline_deviation",
    "anchor_watch",
]


class QuantStrategyUpdate(BaseModel):
    enabled: bool


class QuantStrategyOut(BaseModel):
    strategy_key: str
    name: str
    strategy_version: str
    enabled: bool
    parameters: dict
    disclaimer: str
    data_boundary: str
    updated_at: datetime | None = None


class QuantQualificationWrite(BaseModel):
    historical_low: bool | None = None
    valuation_low: bool | None = None
    attention_low: bool | None = None
    note: str = Field(default="", max_length=1000)


class QuantQualificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    stock_id: int
    historical_low: bool | None
    valuation_low: bool | None
    attention_low: bool | None
    note: str
    complete: bool
    qualified: bool
    updated_at: datetime | None = None


class QuantSignalSnapshotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    stock_id: int
    strategy_key: str
    strategy_version: str
    signal: QuantSignal
    reason_codes: list[str]
    metrics: dict
    bar_date: str | None
    source: str
    execution_timing: str | None
    error_code: str | None
    evaluated_at: datetime


class QuantStrategyStockOut(BaseModel):
    stock_id: int
    symbol: str
    name: str
    stage: str
    market: str
    has_position: bool
    qualification: QuantQualificationOut
    latest_snapshot: QuantSignalSnapshotOut | None = None
