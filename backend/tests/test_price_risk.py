import pytest

from app.core.price_risk import assess_price_risk
from app.schemas.prices import DailyBarInput


def bars(count, close=100, low=99, high=101):
    return [DailyBarInput(date=f"2025-{i // 28 + 1:02d}-{i % 28 + 1:02d}", open=close, high=high, low=low, close=close) for i in range(count)]


def test_insufficient_is_not_safe():
    for count in (0, 1, 14):
        result = assess_price_risk(bars(count))
        assert result.status == "insufficient"
        assert all(rule.triggered is None for rule in result.rules)


def test_flat_history_and_fixed_window():
    result = assess_price_risk(bars(150))
    assert result.sample_count == 126
    assert result.status == "clear"
    assert [rule.triggered for rule in result.rules] == [False, False, False]


def test_drawdown_boundary_and_previous_support():
    data = bars(126)
    data[-1] = DailyBarInput(date=data[-1].date, open=100, high=100, low=79, close=80)
    result = assess_price_risk(data)
    assert result.status == "triggered"
    assert result.rules[0].value == pytest.approx(20)
    assert result.rules[0].triggered is True
    assert result.rules[2].threshold == 99
    assert result.rules[2].triggered is True


def test_atr_boundary():
    result = assess_price_risk(bars(126, low=98, high=102))
    assert result.rules[1].value == 4
    assert result.rules[1].triggered is True


def test_bad_history_does_not_produce_clear_result():
    data = bars(126)
    data[-1].close = float("nan")
    assert assess_price_risk(data).status == "insufficient"


def test_partial_history_reports_unknown_long_window():
    result = assess_price_risk(bars(21))
    assert result.status == "insufficient"
    assert result.rules[0].triggered is None
    assert result.rules[1].triggered is False
    assert result.rules[2].triggered is False
