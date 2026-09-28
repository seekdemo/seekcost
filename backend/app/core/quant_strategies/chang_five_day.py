"""Deterministic implementation of the five-day-line observation strategy."""
from dataclasses import dataclass
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.prices import DailyBarInput

STRATEGY_KEY = "chang-five-day-line"
# 1.1 removes the manual three-low gate; all watchlist stocks are monitored.
STRATEGY_VERSION = "1.1.0"
DEFAULT_MARKET_DATA_SOURCE = "market_data"


class ChangFiveDayParameters(BaseModel):
    volume_multiplier: float = Field(gt=0)
    break_buffer_pct: float = Field(ge=0, lt=1)
    hard_stop_pct: float = Field(ge=0, lt=1)
    recovery_sessions: int = Field(ge=1)
    pullback_max_bias_pct: float = Field(ge=0)
    trend_lookback: int = Field(ge=1)


DEFAULT_PARAMETERS = ChangFiveDayParameters(
    volume_multiplier=1.45,
    break_buffer_pct=0.075,
    hard_stop_pct=0.20,
    recovery_sessions=3,
    pullback_max_bias_pct=0.02,
    trend_lookback=5,
)


@dataclass(frozen=True, slots=True)
class ThreeLowQualification:
    historical_low: bool | None = None
    valuation_low: bool | None = None
    attention_low: bool | None = None

    @property
    def is_qualified(self) -> bool:
        return all(value is True for value in self.values())

    @property
    def is_complete(self) -> bool:
        return all(value is not None for value in self.values())

    def values(self) -> tuple[bool | None, bool | None, bool | None]:
        return (self.historical_low, self.valuation_low, self.attention_low)


@dataclass(frozen=True, slots=True)
class PositionContext:
    has_position: bool = False
    cost_basis: float | None = None

    def __post_init__(self) -> None:
        if self.cost_basis is not None and self.cost_basis <= 0:
            raise ValueError("cost_basis must be positive when supplied")


class ChangFiveDayMetrics(BaseModel):
    bar_count: int
    close: float | None = None
    volume: float | None = None
    ma5: float | None = None
    volume_ma5: float | None = None
    volume_ratio: float | None = None
    volume_ratios: list[float | None] = Field(default_factory=list)
    ma5_bias_pct: float | None = None
    cost_basis: float | None = None
    hard_stop_price: float | None = None
    ma5_break_price: float | None = None
    latest_three_below_or_equal_ma5: bool | None = None
    current_ma5_rising: bool | None = None
    prior_trend_sessions: int = 0
    prior_ma5_steps_rising: bool | None = None


Signal = Literal[
    "entry_breakout",
    "entry_pullback",
    "risk_exit",
    "hold_trend",
    "trend_warning",
    "watch",
    "needs_qualification",
    "not_eligible",
    "insufficient_data",
]


class ChangFiveDayResult(BaseModel):
    strategy_key: str = STRATEGY_KEY
    strategy_version: str = STRATEGY_VERSION
    source: str = Field(default=DEFAULT_MARKET_DATA_SOURCE, min_length=1)
    signal: Signal
    reason_codes: list[str] = Field(default_factory=list)
    execution_timing: Literal["next_session_open"] | None = None
    bar_date: int | str | None = None
    metrics: ChangFiveDayMetrics


def _rolling_average(values: list[float], window: int) -> list[float | None]:
    total = 0.0
    averages: list[float | None] = []
    for index, value in enumerate(values):
        total += value
        if index >= window:
            total -= values[index - window]
        averages.append(round(total / window, 6) if index + 1 >= window else None)
    return averages


def _result(
    signal: Signal,
    reason_codes: list[str],
    bars: list[DailyBarInput],
    metrics: ChangFiveDayMetrics,
    *,
    actionable: bool = False,
    source: str = DEFAULT_MARKET_DATA_SOURCE,
) -> ChangFiveDayResult:
    return ChangFiveDayResult(
        source=source,
        signal=signal,
        reason_codes=reason_codes,
        execution_timing="next_session_open" if actionable else None,
        bar_date=bars[-1].date if bars else None,
        metrics=metrics,
    )


def evaluate_chang_five_day(
    bars: list[DailyBarInput],
    qualification: ThreeLowQualification,
    position: PositionContext,
    parameters: ChangFiveDayParameters = DEFAULT_PARAMETERS,
    *,
    source: str = DEFAULT_MARKET_DATA_SOURCE,
) -> ChangFiveDayResult:
    """Evaluate completed bars; callers provide the market-data source as evidence metadata.

    ``qualification`` remains in the signature for compatibility with saved strategy
    records and older callers. It is intentionally not a gate: this plugin monitors
    every stock in the user's watchlist and reports the current rule state.
    """
    closes = [float(bar.close) for bar in bars]
    volumes = [float(bar.volume) for bar in bars]
    ma5_values = _rolling_average(closes, 5)
    volume_ma5_values = _rolling_average(volumes, 5)
    volume_ratios = [
        round(volume / average, 6) if average and average > 0 else None
        for volume, average in zip(volumes, volume_ma5_values)
    ]

    current_ma5 = ma5_values[-1] if ma5_values else None
    current_volume_ma5 = volume_ma5_values[-1] if volume_ma5_values else None
    current_close = closes[-1] if closes else None
    current_volume = volumes[-1] if volumes else None
    current_ratio = volume_ratios[-1] if volume_ratios else None
    ma5_bias_pct = (
        round(current_close / current_ma5 - 1, 6)
        if current_close is not None and current_ma5 not in (None, 0)
        else None
    )
    hard_stop_price = (
        round(position.cost_basis * (1 - parameters.hard_stop_pct), 6)
        if position.cost_basis is not None
        else None
    )
    ma5_break_price = (
        round(current_ma5 * (1 - parameters.break_buffer_pct), 6)
        if current_ma5 is not None
        else None
    )
    recovery_ma5 = ma5_values[-parameters.recovery_sessions:]
    three_day_failure = (
        len(closes) >= parameters.recovery_sessions
        and len(recovery_ma5) == parameters.recovery_sessions
        and all(ma5 is not None for ma5 in recovery_ma5)
        and all(close <= ma5 for close, ma5 in zip(closes[-parameters.recovery_sessions:], recovery_ma5))
    )
    current_ma5_rising = (
        len(ma5_values) >= 2 and ma5_values[-1] is not None and ma5_values[-2] is not None and ma5_values[-1] > ma5_values[-2]
    )
    prior_closes = closes[-(parameters.trend_lookback + 1):-1]
    prior_ma5 = ma5_values[-(parameters.trend_lookback + 1):-1]
    prior_trend_sessions = sum(
        close >= ma5 for close, ma5 in zip(prior_closes, prior_ma5) if ma5 is not None
    )
    # Three preceding MA5 transitions require four MA5 observations (T-4 through T-1).
    prior_ma5_steps = ma5_values[-5:-1]
    prior_ma5_steps_rising = (
        len(prior_ma5_steps) == 4
        and all(value is not None for value in prior_ma5_steps)
        and prior_ma5_steps[0] < prior_ma5_steps[1] < prior_ma5_steps[2] < prior_ma5_steps[3]
    )
    metrics = ChangFiveDayMetrics(
        bar_count=len(bars),
        close=current_close,
        volume=current_volume,
        ma5=current_ma5,
        volume_ma5=current_volume_ma5,
        volume_ratio=current_ratio,
        volume_ratios=volume_ratios[-3:],
        ma5_bias_pct=ma5_bias_pct,
        cost_basis=position.cost_basis,
        hard_stop_price=hard_stop_price,
        ma5_break_price=ma5_break_price,
        latest_three_below_or_equal_ma5=three_day_failure if len(bars) >= parameters.recovery_sessions + 4 else None,
        current_ma5_rising=current_ma5_rising,
        prior_trend_sessions=prior_trend_sessions,
        prior_ma5_steps_rising=prior_ma5_steps_rising,
    )

    risk_codes: list[str] = []
    if position.has_position and current_close is not None:
        if hard_stop_price is not None and current_close <= hard_stop_price:
            risk_codes.append("hard_stop")
        if ma5_break_price is not None and current_close <= ma5_break_price:
            risk_codes.append("ma5_buffer_break")
        if three_day_failure:
            risk_codes.append("three_day_ma5_failure")
    if risk_codes:
        return _result("risk_exit", risk_codes, bars, metrics, actionable=True, source=source)

    # Ten bars provide aligned MA5 values for the five-session trend gate.
    if len(bars) < 10:
        return _result("insufficient_data", ["insufficient_ma5_history"], bars, metrics, source=source)

    latest_three_ratios = volume_ratios[-3:]
    breakout = (
        not position.has_position
        and
        current_close is not None
        and current_ma5 is not None
        and current_close > current_ma5
        and current_ma5_rising is True
        and len(latest_three_ratios) == 3
        and all(ratio is not None and ratio >= parameters.volume_multiplier for ratio in latest_three_ratios)
    )
    if breakout:
        return _result("entry_breakout", ["breakout_volume"], bars, metrics, actionable=True, source=source)

    pullback = (
        not position.has_position
        and
        current_close is not None
        and current_ma5 is not None
        and current_volume is not None
        and current_volume_ma5 is not None
        and current_ma5 <= current_close <= current_ma5 * (1 + parameters.pullback_max_bias_pct)
        and current_volume < current_volume_ma5
        and current_ma5_rising is True
        and prior_trend_sessions >= parameters.trend_lookback - 1
        and prior_ma5_steps_rising is True
    )
    if pullback:
        return _result("entry_pullback", ["pullback_to_rising_ma5"], bars, metrics, actionable=True, source=source)

    if current_close is not None and current_ma5 is not None and current_close >= current_ma5 and current_ma5_rising:
        return _result("hold_trend", ["ma5_trend_intact"], bars, metrics, source=source)
    return _result("trend_warning", ["ma5_trend_warning"], bars, metrics, source=source)
