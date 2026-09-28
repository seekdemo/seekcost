from datetime import datetime, timezone

import pytest

from app.core.market_history import completed_daily_bars, infer_watch_market
from app.core.quant_strategies.chang_five_day import (
    DEFAULT_PARAMETERS,
    PositionContext,
    ThreeLowQualification,
    evaluate_chang_five_day,
)
from app.schemas.prices import DailyBarInput


def _bars(closes: list[float], volumes: list[float] | None = None) -> list[DailyBarInput]:
    volumes = volumes or [100] * len(closes)
    return [
        DailyBarInput(
            date=1_700_000_000 + index * 86_400,
            open=close - 0.5,
            high=close + 1,
            low=close - 1,
            close=close,
            volume=volumes[index],
        )
        for index, close in enumerate(closes)
    ]


def test_breakout_requires_three_consecutive_145x_volume_sessions():
    result = evaluate_chang_five_day(
        _bars(list(range(10, 20)), [100] * 7 + [500, 500, 500]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
        DEFAULT_PARAMETERS,
        source="fixture_market_history",
    )

    assert result.signal == "entry_breakout"
    assert result.reason_codes == ["breakout_volume"]
    assert result.execution_timing == "next_session_open"
    assert result.source == "fixture_market_history"
    assert result.metrics.volume_ratios == pytest.approx([2.777778, 1.923077, 1.470588])


def test_breakout_rejects_one_weak_volume_session():
    result = evaluate_chang_five_day(
        _bars(list(range(10, 20)), [100] * 7 + [500, 500, 400]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
    )

    assert result.signal == "hold_trend"
    assert "breakout_volume" not in result.reason_codes


def test_breakout_rejects_declining_ma5_despite_three_volume_sessions():
    result = evaluate_chang_five_day(
        _bars([30, 30, 30, 30, 30, 25, 20, 15, 16, 20], [100] * 7 + [500, 500, 500]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
    )

    assert result.metrics.current_ma5_rising is False
    assert result.signal == "trend_warning"
    assert "breakout_volume" not in result.reason_codes


def test_pullback_requires_all_trend_and_low_volume_conditions():
    result = evaluate_chang_five_day(
        _bars([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 18.9], [100] * 11 + [50]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
    )

    assert result.signal == "entry_pullback"
    assert result.reason_codes == ["pullback_to_rising_ma5"]
    assert result.execution_timing == "next_session_open"
    assert result.metrics.ma5_bias_pct == pytest.approx(0.017223, abs=1e-6)


def test_pullback_rejects_two_prior_ma5_rises_when_the_third_transition_fails():
    result = evaluate_chang_five_day(
        _bars([10, 10, 10, 10, 30, 20, 20, 20, 20, 20, 21, 22, 21], [100] * 12 + [50]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
    )

    assert result.metrics.prior_ma5_steps_rising is False
    assert result.signal == "hold_trend"


def test_risk_exit_precedes_missing_three_low_qualification_for_a_holding():
    result = evaluate_chang_five_day(
        _bars([110] * 7 + [111, 110, 110, 110, 99]),
        ThreeLowQualification(None, None, None),
        PositionContext(has_position=True, cost_basis=120),
        DEFAULT_PARAMETERS,
    )

    assert result.signal == "risk_exit"
    assert "ma5_buffer_break" in result.reason_codes
    assert result.execution_timing == "next_session_open"


def test_hard_stop_is_actionable_without_enough_bars_for_an_entry():
    result = evaluate_chang_five_day(
        _bars([100, 99, 80]),
        ThreeLowQualification(None, None, None),
        PositionContext(has_position=True, cost_basis=100),
    )

    assert result.signal == "risk_exit"
    assert result.reason_codes == ["hard_stop"]


def test_holding_never_emits_a_new_entry_signal():
    result = evaluate_chang_five_day(
        _bars(list(range(10, 20)), [100] * 7 + [500, 500, 500]),
        ThreeLowQualification(True, True, True),
        PositionContext(has_position=True, cost_basis=10),
    )

    assert result.signal == "hold_trend"


def test_three_day_ma5_failure_is_limited_to_latest_three_sessions():
    result = evaluate_chang_five_day(
        _bars([110] * 7 + [111, 110, 100, 100, 100, 120]),
        ThreeLowQualification(None, None, None),
        PositionContext(has_position=True, cost_basis=100),
    )

    assert result.signal != "risk_exit"
    assert "three_day_ma5_failure" not in result.reason_codes


def test_missing_qualification_does_not_block_monitoring_entries():
    result = evaluate_chang_five_day(
        _bars(list(range(10, 20)), [100] * 7 + [500, 500, 500]),
        ThreeLowQualification(None, None, None),
        PositionContext(),
    )

    assert result.signal == "entry_breakout"
    assert result.reason_codes == ["breakout_volume"]
    assert result.metrics.ma5 is not None


def test_false_qualification_does_not_change_market_signal():
    result = evaluate_chang_five_day(
        _bars(list(range(10, 20)), [100] * 7 + [500, 500, 500]),
        ThreeLowQualification(True, False, True),
        PositionContext(),
    )

    assert result.signal == "entry_breakout"
    assert result.reason_codes == ["breakout_volume"]


def test_insufficient_data_has_no_entry_or_risk_claim():
    result = evaluate_chang_five_day(
        _bars([10, 11, 12, 13]),
        ThreeLowQualification(True, True, True),
        PositionContext(),
    )

    assert result.signal == "insufficient_data"
    assert result.execution_timing is None
    assert result.metrics.ma5 is None


def test_completed_daily_bars_excludes_only_same_session_before_close_cutoff():
    bars = _bars([10, 11])
    bars[-2].date = int(datetime(2024, 1, 2, 21, tzinfo=timezone.utc).timestamp())
    bars[-1].date = int(datetime(2024, 1, 3, 21, tzinfo=timezone.utc).timestamp())

    before_close = completed_daily_bars(
        bars,
        "America/New_York",
        now=datetime(2024, 1, 3, 16, 14, tzinfo=timezone.utc),
    )
    after_close = completed_daily_bars(
        bars,
        "America/New_York",
        now=datetime(2024, 1, 3, 21, 15, tzinfo=timezone.utc),
    )

    assert before_close == bars[:-1]
    assert after_close == bars


@pytest.mark.parametrize(
    ("symbol", "sector", "expected"),
    [
        ("0700.HK", "", "hk"),
        ("600519", "consumer staples", "cn"),
        ("BTC-USD", "", "crypto"),
        ("AAPL", "technology", "us"),
    ],
)
def test_infer_watch_market(symbol, sector, expected):
    assert infer_watch_market(symbol, sector) == expected
