import pytest

from app.core.quant_strategies.price_anchor import evaluate_price_anchor
from app.schemas.prices import DailyBarInput, PriceAnchors


def _bars(
    closes: list[float],
    *,
    highs: list[float] | None = None,
    lows: list[float] | None = None,
    volumes: list[float] | None = None,
) -> list[DailyBarInput]:
    highs = highs or [close + 10 for close in closes]
    lows = lows or [close - 10 for close in closes]
    volumes = volumes or [1_000 for _ in closes]
    return [
        DailyBarInput(
            date=f"2026-07-{index + 1:02d}",
            open=close,
            high=highs[index],
            low=lows[index],
            close=close,
            volume=volumes[index],
        )
        for index, close in enumerate(closes)
    ]


def test_saved_strike_fair_and_target_anchors_trigger_distinct_signals():
    strike_anchors = PriceAnchors(strike_price=100, fair_price=105, target_price=120)
    strike = evaluate_price_anchor(_bars([100] * 20 + [99]), strike_anchors)

    assert strike.signal == "anchor_strike_zone"
    assert strike.reason_codes == ["saved_strike_reached"]
    assert strike.metrics.reference_code == "saved_strike"
    assert strike.metrics.reference_price == 100
    assert strike_anchors == PriceAnchors(strike_price=100, fair_price=105, target_price=120)

    fair = evaluate_price_anchor(
        _bars([100] * 21),
        PriceAnchors(fair_price=100, target_price=120),
    )
    assert fair.signal == "anchor_fair_zone"
    assert fair.reason_codes == ["near_saved_fair_price"]
    assert fair.metrics.fair_price_gap_pct == 0

    target = evaluate_price_anchor(
        _bars([100] * 21),
        PriceAnchors(target_price=100),
    )
    assert target.signal == "anchor_target_zone"
    assert target.reason_codes[0] == "saved_target_reached"
    assert target.metrics.reference_code == "saved_target"


def test_risk_has_priority_over_other_price_anchor_conditions():
    result = evaluate_price_anchor(
        _bars([100] * 20 + [80], highs=[120] * 21, lows=[70] * 21),
        PriceAnchors(strike_price=90, fair_price=80, target_price=75),
    )

    assert result.signal == "anchor_risk"
    assert result.reason_codes == ["anchor_ma5_risk_break"]
    assert result.metrics.reference_code == "ma5_risk_line"
    assert result.metrics.close <= result.metrics.ma5_risk_line


def test_dynamic_ma5_pullback_and_atr_target_are_auditable():
    rising = list(range(80, 101))
    pullback_bars = _bars(
        rising[:-1] + [98.5],
        highs=[close + 5 for close in rising[:-1] + [98.5]],
        lows=[close - 5 for close in rising[:-1] + [98.5]],
    )
    pullback = evaluate_price_anchor(pullback_bars, PriceAnchors(target_price=130))

    assert pullback.signal == "anchor_strike_zone"
    assert pullback.reason_codes == ["ma5_atr_pullback_zone"]
    assert pullback.metrics.ma5_rising is True
    assert pullback.metrics.ma5_pullback_lower <= pullback.metrics.close
    assert pullback.metrics.close <= pullback.metrics.ma5_pullback_upper

    target_bars = _bars(
        [100] * 20 + [110],
        highs=[105] * 20 + [110],
        lows=[95] * 20 + [100],
    )
    atr_target = evaluate_price_anchor(
        target_bars,
        PriceAnchors(strike_price=90, target_price=130),
    )
    assert atr_target.signal == "anchor_target_zone"
    assert "atr_target_reached" in atr_target.reason_codes
    assert atr_target.metrics.strike_plus_2atr == pytest.approx(110)


def test_market_baseline_deviation_is_not_presented_as_fair_value():
    bars = _bars(
        [100] * 21,
        highs=[120] * 21,
        lows=[100] * 21,
        volumes=[1_000] * 21,
    )
    result = evaluate_price_anchor(bars, PriceAnchors())

    assert result.signal == "market_baseline_deviation"
    assert result.reason_codes == ["vwap20_deviation"]
    assert result.metrics.vwap20_gap_pct == pytest.approx(-0.0625)
    assert result.metrics.reference_code == "vwap20"


def test_signal_priority_is_target_then_strike_then_fair_then_baseline():
    bars = _bars([100] * 21, highs=[110] * 21, lows=[90] * 21)
    result = evaluate_price_anchor(
        bars,
        PriceAnchors(strike_price=101, fair_price=100, target_price=100),
    )

    assert result.signal == "anchor_target_zone"
    assert result.reason_codes[0] == "saved_target_reached"


def test_short_history_is_insufficient_and_never_claims_an_action():
    result = evaluate_price_anchor(_bars([100] * 20), PriceAnchors(strike_price=100))

    assert result.signal == "insufficient_data"
    assert result.reason_codes == ["insufficient_anchor_history"]
    assert result.execution_timing is None
    assert result.bar_date == "2026-07-20"
    assert result.metrics.bar_count == 20


def test_no_condition_returns_neutral_watch_signal():
    result = evaluate_price_anchor(
        _bars([100] * 21, highs=[110] * 21, lows=[90] * 21),
        PriceAnchors(target_price=130),
    )

    assert result.signal == "anchor_watch"
    assert result.reason_codes == ["no_anchor_trigger"]
    assert result.execution_timing is None
