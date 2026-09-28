from datetime import datetime
from zoneinfo import ZoneInfo

from app.core.intraday_monitor import evaluate_intraday_preview


TZ = ZoneInfo("America/New_York")


def _ts(day: int, hour: int = 10, minute: int = 5) -> int:
    return int(datetime(2026, 8, day, hour, minute, tzinfo=TZ).timestamp())


def _bar(day: int, volume: int, minute: int = 5) -> dict:
    return {"timestamp": _ts(day, 10, minute), "open": 100, "high": 101, "low": 99, "close": 100, "volume": volume}


def _daily() -> list[dict]:
    return [{"date": f"2026-08-{day:02d}", "close": close} for day, close in zip(range(15, 20), [98, 99, 100, 101, 102])]


def test_price_near_strike_is_provisional_warning():
    result = evaluate_intraday_preview(
        symbol="AAOI",
        market="us",
        intraday_items=[_bar(20, 100)],
        daily_bars=_daily(),
        current_price=99.5,
        strike_price=100,
        fair_price=None,
        target_price=None,
        exchange_timezone="America/New_York",
        now=datetime(2026, 8, 20, 10, 5, tzinfo=TZ),
    )
    assert result["warning_code"] == "near_strike"
    assert result["status"] == "pending_close"
    assert result["is_provisional"] is True


def test_risk_line_takes_precedence_over_price_anchor():
    result = evaluate_intraday_preview(
        symbol="AAOI",
        market="us",
        intraday_items=[_bar(20, 100)],
        daily_bars=_daily(),
        current_price=94,
        strike_price=94,
        fair_price=None,
        target_price=None,
        exchange_timezone="America/New_York",
        now=datetime(2026, 8, 20, 10, 5, tzinfo=TZ),
    )
    assert result["warning_code"] == "near_risk_line"


def test_volume_uses_same_clock_time_from_prior_sessions():
    items = []
    for day, volume in [(17, 100), (18, 100), (19, 100), (20, 160)]:
        items.extend([_bar(day, volume // 2, 0), _bar(day, volume // 2, 5)])
    result = evaluate_intraday_preview(
        symbol="AAOI",
        market="us",
        intraday_items=items,
        daily_bars=[],
        current_price=100,
        strike_price=None,
        fair_price=None,
        target_price=None,
        exchange_timezone="America/New_York",
        now=datetime(2026, 8, 20, 10, 5, tzinfo=TZ),
    )
    assert result["warning_code"] == "unusual_volume"
    assert result["evidence"]["volume_ratio_3d"] == 1.6


def test_missing_intraday_data_is_item_level_error():
    result = evaluate_intraday_preview(
        symbol="AAOI",
        market="us",
        intraday_items=[],
        daily_bars=_daily(),
        current_price=100,
        strike_price=None,
        fair_price=None,
        target_price=None,
    )
    assert result["warning_code"] == "data_unavailable"
    assert result["error_code"] == "intraday_bars_unavailable"
    assert result["is_provisional"] is True


def test_position_stop_is_highest_priority():
    result = evaluate_intraday_preview(
        symbol="AAOI",
        market="us",
        intraday_items=[_bar(20, 100)],
        daily_bars=_daily(),
        current_price=84,
        strike_price=84,
        fair_price=None,
        target_price=None,
        position_cost=100,
        position_quantity=10,
        exchange_timezone="America/New_York",
        now=datetime(2026, 8, 20, 10, 5, tzinfo=TZ),
    )
    assert result["warning_code"] == "near_position_stop"
