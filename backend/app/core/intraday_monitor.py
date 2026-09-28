"""Pure, provisional intraday warning calculations.

This module intentionally has no database or snapshot side effects. It is a
small observation layer that sits beside the completed-daily-bar cockpit.
"""
from collections import defaultdict
from datetime import datetime, timezone
from math import isfinite
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


VOLUME_THRESHOLD = 1.45
PRICE_PROXIMITY = 0.02


def _number(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if isfinite(number) else None


def _timestamp(item: dict) -> int | None:
    value = item.get("timestamp", item.get("date"))
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _local_minute(timestamp: int, timezone_name: str) -> tuple[str, int] | None:
    try:
        local = datetime.fromtimestamp(timestamp, timezone.utc).astimezone(ZoneInfo(timezone_name))
    except (TypeError, ValueError, OSError, ZoneInfoNotFoundError):
        return None
    return local.date().isoformat(), local.hour * 60 + local.minute


def _same_time_volume_ratio(
    items: list[dict],
    timezone_name: str,
    now: datetime | None,
) -> tuple[str | None, float | None, float | None]:
    """Compare current cumulative volume with the prior three sessions.

    Each prior session is accumulated only through the current local clock
    minute. This prevents a partial session from being compared to a full day.
    """
    if not items:
        return None, None, None
    try:
        market_timezone = ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return None, None, None
    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current_local = current.astimezone(market_timezone)
    current_date = current_local.date().isoformat()
    current_minute = current_local.hour * 60 + current_local.minute
    sessions: dict[str, list[tuple[int, float]]] = defaultdict(list)
    for item in items:
        timestamp = _timestamp(item)
        if timestamp is None:
            continue
        moment = _local_minute(timestamp, timezone_name)
        if moment is None:
            continue
        session, minute = moment
        if datetime.fromtimestamp(timestamp, timezone.utc) > current.astimezone(timezone.utc):
            continue
        sessions[session].append((minute, _number(item.get("volume")) or 0.0))
    if current_date not in sessions:
        current_date = max(sessions, default=None)
        if current_date is None:
            return None, None, None
    current_cumulative = sum(volume for minute, volume in sessions[current_date] if minute <= current_minute)
    prior_dates = sorted((key for key in sessions if key < current_date), reverse=True)[:3]
    if not prior_dates:
        return current_date, current_cumulative, None
    prior_cumulative = []
    for session in prior_dates:
        values = sessions[session]
        cutoff = max((minute for minute, _volume in values if minute <= current_minute), default=None)
        if cutoff is None:
            continue
        prior_cumulative.append(sum(volume for minute, volume in values if minute <= cutoff))
    if not prior_cumulative:
        return current_date, current_cumulative, None
    baseline = sum(prior_cumulative) / len(prior_cumulative)
    return current_date, current_cumulative, round(current_cumulative / baseline, 4) if baseline > 0 else None


def _completed_closes(daily_bars: list[dict]) -> list[float]:
    closes = []
    for bar in daily_bars:
        close = _number(bar.get("close"))
        if close is not None and close > 0:
            closes.append(close)
    return closes


def evaluate_intraday_preview(
    *,
    symbol: str,
    market: str,
    intraday_items: list[dict],
    daily_bars: list[dict],
    current_price: float | None,
    strike_price: float | None,
    fair_price: float | None,
    target_price: float | None,
    position_cost: float | None = None,
    position_quantity: float = 0,
    exchange_timezone: str = "America/New_York",
    now: datetime | None = None,
) -> dict:
    """Return one non-persisted warning for a watchlist symbol."""
    del market  # The normalized timezone and values already carry market context.
    current = _number(current_price)
    valid_intraday = [item for item in intraday_items if _timestamp(item) is not None]
    if current is None and valid_intraday:
        current = _number(valid_intraday[-1].get("close"))
    session, cumulative_volume, volume_ratio = _same_time_volume_ratio(valid_intraday, exchange_timezone, now)
    base = {
        "symbol": symbol,
        "status": "pending_close",
        "is_provisional": True,
        "warning_code": "quiet",
        "severity": "neutral",
        "session": session,
        "error_code": None,
        "evidence": {
            "current_price": current,
            "cumulative_volume": cumulative_volume,
            "volume_ratio_3d": volume_ratio,
            "volume_threshold": VOLUME_THRESHOLD,
            "ma5": None,
            "ma5_risk_line": None,
            "strike_price": _number(strike_price),
            "fair_price": _number(fair_price),
            "target_price": _number(target_price),
            "price_gap_to_strike_pct": None,
            "price_gap_to_fair_pct": None,
            "price_gap_to_target_pct": None,
            "position_stop_price": None,
        },
    }
    if not valid_intraday or current is None:
        base["warning_code"] = "data_unavailable"
        base["severity"] = "info"
        base["error_code"] = "intraday_bars_unavailable"
        return base

    evidence = base["evidence"]
    closes = _completed_closes(daily_bars)
    if len(closes) >= 5:
        ma5 = sum(closes[-5:]) / 5
        risk_line = ma5 * 0.925
        evidence["ma5"] = round(ma5, 4)
        evidence["ma5_risk_line"] = round(risk_line, 4)
    for key, price_key in (
        ("strike_price", "price_gap_to_strike_pct"),
        ("fair_price", "price_gap_to_fair_pct"),
        ("target_price", "price_gap_to_target_pct"),
    ):
        anchor = evidence[key]
        if anchor and anchor > 0:
            evidence[price_key] = round(current / anchor - 1, 4)

    stop_price = None
    cost = _number(position_cost)
    quantity = _number(position_quantity) or 0
    if cost and cost > 0 and quantity > 0:
        stop_price = cost * 0.8
        evidence["position_stop_price"] = round(stop_price, 4)

    warning = ("quiet", "neutral")
    if stop_price and current <= stop_price * 1.05:
        warning = ("near_position_stop", "critical")
    elif evidence["ma5_risk_line"] and current <= evidence["ma5_risk_line"] * 1.02:
        warning = ("near_risk_line", "warning")
    elif evidence["strike_price"] and abs(current / evidence["strike_price"] - 1) <= PRICE_PROXIMITY:
        warning = ("near_strike", "watch")
    elif evidence["fair_price"] and abs(current / evidence["fair_price"] - 1) <= PRICE_PROXIMITY:
        warning = ("near_fair_value", "watch")
    elif evidence["target_price"] and current >= evidence["target_price"] * (1 - PRICE_PROXIMITY):
        warning = ("near_target", "warning")
    elif volume_ratio is not None and volume_ratio >= VOLUME_THRESHOLD:
        warning = ("unusual_volume", "watch")
    base["warning_code"], base["severity"] = warning
    return base
