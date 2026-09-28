"""Typed contracts for auditable daily price-volume observations."""
from pydantic import BaseModel, Field
from typing import Literal


class DailyBarInput(BaseModel):
    date: int | str
    open: float
    high: float
    low: float
    close: float
    volume: float = 0


class MovingAveragePoint(BaseModel):
    date: int | str
    ma5: float | None = None
    ma10: float | None = None
    ma20: float | None = None
    ma60: float | None = None
    ma120: float | None = None
    ma250: float | None = None


class PriceAnchors(BaseModel):
    fair_price: float | None = None
    strike_price: float | None = None
    target_price: float | None = None


class PriceVolumeObservation(BaseModel):
    ma5: float | None = None
    ma20: float | None = None
    ma60: float | None = None
    ma120: float | None = None
    annualized_volatility: float | None = None
    atr14: float | None = None
    max_drawdown: float | None = None
    relative_volume20: float | None = None
    vwap20: float | None = None
    vwap60: float | None = None
    support20: float | None = None
    resistance20: float | None = None
    support60: float | None = None
    resistance60: float | None = None
    trend_basis: str | None = None
    volume_basis: str | None = None
    volatility_basis: str | None = None
    drawdown_basis: str | None = None
    position_basis: str | None = None
    divergence_basis: str | None = None


class PriceRiskRule(BaseModel):
    code: Literal["peak_decline", "atr_ratio", "support_break"]
    value: float | None = None
    threshold: float | None = None
    triggered: bool | None = None


class PriceRiskAssessment(BaseModel):
    status: Literal["clear", "triggered", "insufficient"]
    version: str = "1.0"
    sample_count: int = 0
    as_of: int | str | None = None
    rules: list[PriceRiskRule] = Field(default_factory=list)


class PriceVolumeResponse(BaseModel):
    symbol: str
    market: str
    range: str
    currency: str = ""
    exchange_timezone: str = ""
    items: list[DailyBarInput] = Field(default_factory=list)
    moving_averages: list[MovingAveragePoint] = Field(default_factory=list)
    observation: PriceVolumeObservation
    risk_assessment: PriceRiskAssessment | None = None
    data_quality: str
    source: str
    as_of: str | None = None
