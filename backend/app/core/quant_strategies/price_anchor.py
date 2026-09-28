"""Deterministic monitoring for saved price anchors and dynamic price references."""
from typing import Literal

from pydantic import BaseModel, Field

from app.core.price_volume import build_price_volume_observation
from app.schemas.prices import DailyBarInput, PriceAnchors

STRATEGY_KEY = "price-anchor-observation"
STRATEGY_VERSION = "1.0.0"
DEFAULT_MARKET_DATA_SOURCE = "market_data"


class PriceAnchorParameters(BaseModel):
    anchor_proximity_pct: float = Field(default=0.02, ge=0, lt=1)
    resistance_proximity_pct: float = Field(default=0.02, ge=0, lt=1)
    baseline_deviation_pct: float = Field(default=0.05, ge=0, lt=1)
    ma5_upper_atr: float = Field(default=0.2, ge=0)
    ma5_lower_atr: float = Field(default=0.5, ge=0)
    risk_buffer_pct: float = Field(default=0.075, ge=0, lt=1)


DEFAULT_PARAMETERS = PriceAnchorParameters()


class PriceAnchorMetrics(BaseModel):
    bar_count: int
    close: float | None = None
    previous_close: float | None = None
    strike_price: float | None = None
    fair_price: float | None = None
    target_price: float | None = None
    ma5: float | None = None
    ma5_rising: bool | None = None
    ma60: float | None = None
    atr14: float | None = None
    vwap20: float | None = None
    vwap60: float | None = None
    support60: float | None = None
    resistance20: float | None = None
    resistance60: float | None = None
    ma5_risk_line: float | None = None
    ma5_pullback_lower: float | None = None
    ma5_pullback_upper: float | None = None
    strike_plus_2atr: float | None = None
    fair_price_gap_pct: float | None = None
    vwap20_gap_pct: float | None = None
    vwap60_gap_pct: float | None = None
    ma60_gap_pct: float | None = None
    reference_code: str | None = None
    reference_price: float | None = None
    reference_gap_pct: float | None = None


Signal = Literal[
    "anchor_strike_zone",
    "anchor_fair_zone",
    "anchor_target_zone",
    "anchor_risk",
    "market_baseline_deviation",
    "anchor_watch",
    "insufficient_data",
]


class PriceAnchorResult(BaseModel):
    strategy_key: str = STRATEGY_KEY
    strategy_version: str = STRATEGY_VERSION
    source: str = Field(default=DEFAULT_MARKET_DATA_SOURCE, min_length=1)
    signal: Signal
    reason_codes: list[str] = Field(default_factory=list)
    execution_timing: None = None
    bar_date: int | str | None = None
    metrics: PriceAnchorMetrics


def _round(value: float | None) -> float | None:
    return round(value, 6) if value is not None else None


def _positive(value: float | None) -> float | None:
    return float(value) if value is not None and value > 0 else None


def _gap(close: float | None, reference: float | None) -> float | None:
    if close is None or reference is None or reference <= 0:
        return None
    return _round(close / reference - 1)


def _result(
    signal: Signal,
    reason_codes: list[str],
    bars: list[DailyBarInput],
    metrics: PriceAnchorMetrics,
    *,
    reference_code: str | None = None,
    reference_price: float | None = None,
    source: str,
) -> PriceAnchorResult:
    metrics.reference_code = reference_code
    metrics.reference_price = _round(reference_price)
    metrics.reference_gap_pct = _gap(metrics.close, reference_price)
    return PriceAnchorResult(
        source=source,
        signal=signal,
        reason_codes=reason_codes,
        bar_date=bars[-1].date if bars else None,
        metrics=metrics,
    )


def evaluate_price_anchor(
    bars: list[DailyBarInput],
    anchors: PriceAnchors,
    parameters: PriceAnchorParameters = DEFAULT_PARAMETERS,
    *,
    source: str = DEFAULT_MARKET_DATA_SOURCE,
) -> PriceAnchorResult:
    """Evaluate saved anchors and dynamic references from completed daily bars."""
    close = float(bars[-1].close) if bars else None
    previous_close = float(bars[-2].close) if len(bars) >= 2 else None
    strike_price = _positive(anchors.strike_price)
    fair_price = _positive(anchors.fair_price)
    target_price = _positive(anchors.target_price)
    observation = build_price_volume_observation(bars, anchors)
    previous_ma5 = (
        sum(float(bar.close) for bar in bars[-6:-1]) / 5
        if len(bars) >= 6
        else None
    )
    ma5_rising = (
        observation.ma5 > previous_ma5
        if observation.ma5 is not None and previous_ma5 is not None
        else None
    )
    ma5_risk_line = (
        observation.ma5 * (1 - parameters.risk_buffer_pct)
        if observation.ma5 is not None
        else None
    )
    ma5_pullback_lower = (
        observation.ma5 - observation.atr14 * parameters.ma5_lower_atr
        if observation.ma5 is not None and observation.atr14 is not None
        else None
    )
    ma5_pullback_upper = (
        observation.ma5 + observation.atr14 * parameters.ma5_upper_atr
        if observation.ma5 is not None and observation.atr14 is not None
        else None
    )
    strike_plus_2atr = (
        strike_price + observation.atr14 * 2
        if strike_price is not None and observation.atr14 is not None
        else None
    )
    metrics = PriceAnchorMetrics(
        bar_count=len(bars),
        close=close,
        previous_close=previous_close,
        strike_price=strike_price,
        fair_price=fair_price,
        target_price=target_price,
        ma5=_round(observation.ma5),
        ma5_rising=ma5_rising,
        ma60=_round(observation.ma60),
        atr14=_round(observation.atr14),
        vwap20=_round(observation.vwap20),
        vwap60=_round(observation.vwap60),
        support60=_round(observation.support60),
        resistance20=_round(observation.resistance20),
        resistance60=_round(observation.resistance60),
        ma5_risk_line=_round(ma5_risk_line),
        ma5_pullback_lower=_round(ma5_pullback_lower),
        ma5_pullback_upper=_round(ma5_pullback_upper),
        strike_plus_2atr=_round(strike_plus_2atr),
        fair_price_gap_pct=_gap(close, fair_price),
        vwap20_gap_pct=_gap(close, observation.vwap20),
        vwap60_gap_pct=_gap(close, observation.vwap60),
        ma60_gap_pct=_gap(close, observation.ma60),
    )

    if len(bars) < 21 or close is None:
        return _result(
            "insufficient_data",
            ["insufficient_anchor_history"],
            bars,
            metrics,
            source=source,
        )

    if ma5_risk_line is not None and close <= ma5_risk_line:
        return _result(
            "anchor_risk",
            ["anchor_ma5_risk_break"],
            bars,
            metrics,
            reference_code="ma5_risk_line",
            reference_price=ma5_risk_line,
            source=source,
        )

    target_conditions = [
        ("saved_target_reached", "saved_target", target_price, target_price is not None and close >= target_price),
        (
            "near_20d_resistance",
            "resistance20",
            observation.resistance20,
            observation.resistance20 is not None
            and close >= observation.resistance20 * (1 - parameters.resistance_proximity_pct),
        ),
        (
            "near_60d_resistance",
            "resistance60",
            observation.resistance60,
            observation.resistance60 is not None
            and close >= observation.resistance60 * (1 - parameters.resistance_proximity_pct),
        ),
        (
            "atr_target_reached",
            "strike_plus_2atr",
            strike_plus_2atr,
            strike_plus_2atr is not None and close >= strike_plus_2atr,
        ),
    ]
    active_targets = [condition for condition in target_conditions if condition[3]]
    if active_targets:
        return _result(
            "anchor_target_zone",
            [condition[0] for condition in active_targets],
            bars,
            metrics,
            reference_code=active_targets[0][1],
            reference_price=active_targets[0][2],
            source=source,
        )

    ma5_pullback = (
        ma5_rising is True
        and ma5_pullback_lower is not None
        and ma5_pullback_upper is not None
        and ma5_pullback_lower <= close <= ma5_pullback_upper
    )
    near_support60 = (
        observation.support60 is not None
        and abs(close / observation.support60 - 1) <= parameters.anchor_proximity_pct
    )
    strike_conditions = [
        ("saved_strike_reached", "saved_strike", strike_price, strike_price is not None and close <= strike_price),
        ("ma5_atr_pullback_zone", "ma5", observation.ma5, ma5_pullback),
        ("near_60d_support", "support60", observation.support60, near_support60),
    ]
    active_strikes = [condition for condition in strike_conditions if condition[3]]
    if active_strikes:
        return _result(
            "anchor_strike_zone",
            [condition[0] for condition in active_strikes],
            bars,
            metrics,
            reference_code=active_strikes[0][1],
            reference_price=active_strikes[0][2],
            source=source,
        )

    fair_gap = metrics.fair_price_gap_pct
    if fair_gap is not None and abs(fair_gap) <= parameters.anchor_proximity_pct:
        return _result(
            "anchor_fair_zone",
            ["near_saved_fair_price"],
            bars,
            metrics,
            reference_code="saved_fair",
            reference_price=fair_price,
            source=source,
        )

    baseline_conditions = [
        ("vwap20_deviation", "vwap20", observation.vwap20, metrics.vwap20_gap_pct),
        ("vwap60_deviation", "vwap60", observation.vwap60, metrics.vwap60_gap_pct),
        ("ma60_deviation", "ma60", observation.ma60, metrics.ma60_gap_pct),
    ]
    active_baselines = [
        condition
        for condition in baseline_conditions
        if condition[3] is not None and abs(condition[3]) >= parameters.baseline_deviation_pct
    ]
    if active_baselines:
        strongest = max(active_baselines, key=lambda condition: abs(condition[3]))
        return _result(
            "market_baseline_deviation",
            [condition[0] for condition in active_baselines],
            bars,
            metrics,
            reference_code=strongest[1],
            reference_price=strongest[2],
            source=source,
        )

    return _result(
        "anchor_watch",
        ["no_anchor_trigger"],
        bars,
        metrics,
        source=source,
    )
