"""Build the private workbench cockpit from saved quant snapshots only."""
from collections import defaultdict
from datetime import datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.market_history import infer_watch_market
from app.core.quant_strategies import (
    PRICE_ANCHOR_STRATEGY_KEY,
    STRATEGY_KEY,
    VOLUME_RATIO_STRATEGY_KEY,
)
from app.models.asset import Asset, AssetCategory, AssetZone
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategySetting
from app.models.watchlist import WatchStock

COCKPIT_STRATEGY_KEYS = (
    STRATEGY_KEY,
    PRICE_ANCHOR_STRATEGY_KEY,
    VOLUME_RATIO_STRATEGY_KEY,
)
VOLUME_ATTENTION_THRESHOLD = 1.45

_RISK_SIGNALS = {"risk_exit", "anchor_risk"}
_TRIGGER_SIGNALS = {
    "entry_breakout",
    "entry_pullback",
    "trend_warning",
    "anchor_strike_zone",
    "anchor_fair_zone",
    "anchor_target_zone",
    "market_baseline_deviation",
}
_DATA_ISSUE_SIGNALS = {"provider_error", "insufficient_data"}
_POSITION_RISK_SIGNALS = {"risk_exit"}
_ENTRY_SIGNALS = {"entry_breakout", "entry_pullback", "anchor_strike_zone"}
_EXTENDED_SIGNALS = {"anchor_target_zone"}
_LEVEL_PRIORITY = {"risk": 0, "trigger": 1, "change": 2, "data_issue": 3, "normal": 4, "unscanned": 5}
_DISPOSITION_PRIORITY = {"risk": 0, "entry": 1, "extended": 2, "watch": 3, "data_issue": 4}
_SIGNAL_PRIORITY = {
    "risk_exit": 0,
    "anchor_risk": 0,
    "entry_breakout": 1,
    "entry_pullback": 1,
    "anchor_strike_zone": 1,
    "anchor_target_zone": 1,
    "anchor_fair_zone": 2,
    "market_baseline_deviation": 2,
    "trend_warning": 3,
    "provider_error": 4,
    "insufficient_data": 4,
    "hold_trend": 5,
    "volume_observation": 5,
    "anchor_watch": 6,
    "watch": 6,
}
_MARKET_PRIORITY = {"us": 0, "hk": 1, "cn": 2, "cn_index": 3, "tw": 4, "crypto": 5, "other": 6}
_WATCH_READINESS = {
    "fair_value_wait": 0,
    "trend_intact_wait": 1,
    "volume_only": 2,
    "trend_break": 3,
    "trend_repair": 3,
    "no_setup": 4,
    "data_incomplete": 5,
}


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _number(value: Any) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return float(value)
    return None


def _normalized_symbol(symbol: str) -> str:
    normalized = symbol.strip().strip('"').upper()
    for suffix in (".US", ".HK", ".SH", ".SZ", ".SS", ".TW", ".TWO", ".BJ"):
        if normalized.endswith(suffix):
            return normalized[: -len(suffix)]
    return normalized.replace("-USD", "")


def _reference(metrics: dict[str, Any], strategy_key: str) -> tuple[str | None, float | None, float | None]:
    close = _number(metrics.get("close"))
    reference_code = metrics.get("reference_code")
    reference_price = _number(metrics.get("reference_price"))
    reference_gap_pct = _number(metrics.get("reference_gap_pct"))
    if strategy_key == STRATEGY_KEY and reference_price is None:
        reference_code = "ma5"
        reference_price = _number(metrics.get("ma5"))
        if close is not None and reference_price and reference_price > 0:
            reference_gap_pct = close / reference_price - 1
    return (
        str(reference_code) if reference_code else None,
        reference_price,
        reference_gap_pct,
    )


def _evidence(
    current: QuantSignalSnapshot,
    previous: QuantSignalSnapshot | None,
) -> dict[str, Any]:
    metrics = current.metrics or {}
    volume_ratio = _number(metrics.get("volume_ratio_3d"))
    unusual_volume = bool(
        current.strategy_key == VOLUME_RATIO_STRATEGY_KEY
        and volume_ratio is not None
        and volume_ratio >= VOLUME_ATTENTION_THRESHOLD
    )
    changed = bool(previous and previous.signal != current.signal)
    if current.signal in _RISK_SIGNALS:
        level = "risk"
    elif current.signal in _TRIGGER_SIGNALS:
        level = "trigger"
    elif changed:
        level = "change"
    elif current.signal in _DATA_ISSUE_SIGNALS or current.error_code:
        level = "data_issue"
    else:
        level = "normal"
    reference_code, reference_price, reference_gap_pct = _reference(
        metrics, current.strategy_key
    )
    return {
        "strategy_key": current.strategy_key,
        "signal": current.signal,
        "previous_signal": previous.signal if previous else None,
        "changed": changed,
        "level": level,
        "reason_codes": current.reason_codes or [],
        "bar_date": current.bar_date,
        "evaluated_at": _iso(current.evaluated_at),
        "source": current.source,
        "error_code": current.error_code,
        "close": _number(metrics.get("close")),
        "reference_code": reference_code,
        "reference_price": reference_price,
        "reference_gap_pct": reference_gap_pct,
        "ma5_bias_pct": _number(metrics.get("ma5_bias_pct")),
        "ma60_gap_pct": _number(metrics.get("ma60_gap_pct")),
        "volume_ratio_3d": volume_ratio,
        "unusual_volume": unusual_volume,
    }


def _headline_rank(item: dict[str, Any]) -> tuple[int, int, int]:
    return (
        _LEVEL_PRIORITY[item["level"]],
        _SIGNAL_PRIORITY.get(item["signal"], 9),
        COCKPIT_STRATEGY_KEYS.index(item["strategy_key"]),
    )


def _stock_level(signals: list[dict[str, Any]]) -> str:
    if not signals:
        return "unscanned"
    for level in ("risk", "trigger", "change", "data_issue"):
        if any(item["level"] == level for item in signals):
            return level
    return "normal"


def _classify_stock(signals: list[dict[str, Any]]) -> dict[str, Any]:
    """Turn strategy evidence into one operator-facing disposition.

    This is a presentation and prioritization layer, not a new trading rule.
    More defensive evidence always overrides a possible entry setup.
    """
    signal_names = {item["signal"] for item in signals}
    risk_items = [item for item in signals if item["signal"] in _POSITION_RISK_SIGNALS]
    if risk_items:
        return {
            "disposition": "risk",
            "decision_reason": "position_risk",
            "next_step": "review_risk",
            "confirmation_count": len(risk_items),
        }

    # The price-anchor strategy has no position context. A broken defensive
    # trend therefore blocks an entry setup but must not be presented as a
    # sell instruction for a symbol the user may not own.
    if "anchor_risk" in signal_names:
        return {
            "disposition": "watch",
            "decision_reason": "trend_break",
            "next_step": "wait_trend_confirmation",
            "confirmation_count": 0,
        }

    extended_items = [
        item for item in signals
        if item["signal"] in _EXTENDED_SIGNALS
        or (
            item["signal"] == "market_baseline_deviation"
            and (item.get("reference_gap_pct") or 0) > 0
        )
    ]
    if extended_items:
        return {
            "disposition": "extended",
            "decision_reason": (
                "target_or_resistance"
                if any(item["signal"] == "anchor_target_zone" for item in extended_items)
                else "baseline_extended"
            ),
            "next_step": "wait_pullback",
            "confirmation_count": len(extended_items),
        }

    entry_items = [item for item in signals if item["signal"] in _ENTRY_SIGNALS]
    if entry_items:
        if "entry_pullback" in signal_names:
            reason = "pullback_confirmed"
        elif "entry_breakout" in signal_names:
            reason = "breakout_confirmed"
        else:
            reason = "entry_zone"
        volume_confirmation = any(item.get("unusual_volume") for item in signals)
        return {
            "disposition": "entry",
            "decision_reason": reason,
            "next_step": "verify_plan",
            "confirmation_count": len(entry_items) + int(volume_confirmation),
        }

    useful_signals = [item for item in signals if item["signal"] not in _DATA_ISSUE_SIGNALS]
    if not useful_signals:
        return {
            "disposition": "data_issue",
            "decision_reason": "data_incomplete",
            "next_step": "refresh_data",
            "confirmation_count": 0,
        }

    if "anchor_fair_zone" in signal_names:
        reason, next_step = "fair_value_wait", "wait_entry_zone"
    elif "hold_trend" in signal_names:
        reason, next_step = "trend_intact_wait", "wait_pullback_or_breakout"
    elif "trend_warning" in signal_names or "market_baseline_deviation" in signal_names:
        reason, next_step = "trend_repair", "wait_trend_confirmation"
    elif any(item.get("unusual_volume") for item in signals):
        reason, next_step = "volume_only", "wait_price_trend"
    else:
        reason, next_step = "no_setup", "keep_observing"
    return {
        "disposition": "watch",
        "decision_reason": reason,
        "next_step": next_step,
        "confirmation_count": sum(bool(item.get("unusual_volume")) for item in signals),
    }


def _operator_sort_key(item: dict[str, Any]) -> tuple[Any, ...]:
    signals = item["signals"]
    disposition = item["disposition"]
    secondary = 0.0
    distance = 0.0
    if disposition == "risk":
        reason_codes = {
            reason
            for signal in signals
            if signal["signal"] == "risk_exit"
            for reason in signal.get("reason_codes", [])
        }
        secondary = 0 if "hard_stop" in reason_codes else 1 if "three_day_ma5_failure" in reason_codes else 2
    elif disposition == "entry":
        signal_names = {signal["signal"] for signal in signals}
        secondary = 0 if "entry_pullback" in signal_names else 1 if "entry_breakout" in signal_names else 2
        gaps = [abs(signal["reference_gap_pct"]) for signal in signals if signal.get("reference_gap_pct") is not None]
        distance = min(gaps, default=0)
    elif disposition == "extended":
        positive_gaps = [signal["reference_gap_pct"] for signal in signals if (signal.get("reference_gap_pct") or 0) > 0]
        secondary = -max(positive_gaps, default=0)
    elif disposition == "watch":
        secondary = _WATCH_READINESS.get(item["decision_reason"], 9)
        gaps = [abs(signal["reference_gap_pct"]) for signal in signals if signal.get("reference_gap_pct") is not None]
        distance = min(gaps, default=9)
    return (
        _DISPOSITION_PRIORITY[disposition],
        secondary,
        -item["confirmation_count"],
        distance,
        not item["changed"],
        item["symbol"],
    )


async def _position_symbols(db: AsyncSession, user_id: int) -> set[str]:
    symbols = (
        await db.execute(
            select(Asset.symbol).where(
                Asset.user_id == user_id,
                Asset.zone == AssetZone.ACTIVE,
                Asset.category.in_([AssetCategory.STOCK, AssetCategory.ETF]),
                Asset.archived.is_(False),
                Asset.is_cash.is_(False),
                Asset.quantity > 0,
            )
        )
    ).scalars().all()
    return {_normalized_symbol(symbol) for symbol in symbols}


async def _enabled_strategy_keys(db: AsyncSession, user_id: int) -> list[str]:
    rows = (
        await db.execute(
            select(QuantStrategySetting).where(
                QuantStrategySetting.user_id == user_id,
                QuantStrategySetting.strategy_key.in_(COCKPIT_STRATEGY_KEYS),
                QuantStrategySetting.enabled.is_(True),
            )
        )
    ).scalars().all()
    enabled = {row.strategy_key for row in rows}
    return [key for key in COCKPIT_STRATEGY_KEYS if key in enabled]


async def _latest_two_distinct_bars(
    db: AsyncSession,
    user_id: int,
    stock_ids: list[int],
    strategy_keys: list[str],
) -> list[QuantSignalSnapshot]:
    if not stock_ids or not strategy_keys:
        return []
    per_bar = (
        select(
            func.max(QuantSignalSnapshot.id).label("snapshot_id"),
            QuantSignalSnapshot.strategy_key.label("strategy_key"),
            QuantSignalSnapshot.stock_id.label("stock_id"),
            QuantSignalSnapshot.bar_date.label("bar_date"),
        )
        .where(
            QuantSignalSnapshot.user_id == user_id,
            QuantSignalSnapshot.stock_id.in_(stock_ids),
            QuantSignalSnapshot.strategy_key.in_(strategy_keys),
        )
        .group_by(
            QuantSignalSnapshot.strategy_key,
            QuantSignalSnapshot.stock_id,
            QuantSignalSnapshot.bar_date,
        )
        .subquery()
    )
    ranked = select(
        per_bar.c.snapshot_id,
        func.row_number()
        .over(
            partition_by=(per_bar.c.strategy_key, per_bar.c.stock_id),
            order_by=per_bar.c.snapshot_id.desc(),
        )
        .label("bar_rank"),
    ).subquery()
    snapshot_ids = select(ranked.c.snapshot_id).where(ranked.c.bar_rank <= 2)
    return list(
        (
            await db.execute(
                select(QuantSignalSnapshot)
                .where(QuantSignalSnapshot.id.in_(snapshot_ids))
                .order_by(QuantSignalSnapshot.id.desc())
            )
        ).scalars().all()
    )


def _strategy_summary(
    strategy_key: str,
    stocks: list[dict[str, Any]],
    watchlist_count: int,
) -> dict[str, Any]:
    signals = [
        signal
        for stock in stocks
        for signal in stock["signals"]
        if signal["strategy_key"] == strategy_key
    ]
    bar_dates = [item["bar_date"] for item in signals if item["bar_date"]]
    evaluated = [item["evaluated_at"] for item in signals if item["evaluated_at"]]
    return {
        "strategy_key": strategy_key,
        "scanned_count": len(signals),
        "total_count": watchlist_count,
        "trigger_count": sum(item["level"] == "trigger" for item in signals),
        "risk_count": sum(item["level"] == "risk" for item in signals),
        "change_count": sum(item["changed"] for item in signals),
        "data_issue_count": sum(item["level"] == "data_issue" for item in signals),
        "last_bar_date": max(bar_dates, default=None),
        "last_evaluated_at": max(evaluated, default=None),
    }


def _market_sessions(stocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for stock in stocks:
        grouped[stock["market"]].append(stock)
    result = []
    for market, market_stocks in grouped.items():
        bar_dates = [
            signal["bar_date"]
            for stock in market_stocks
            for signal in stock["signals"]
            if signal["bar_date"]
        ]
        latest_bar = max(bar_dates, default=None)
        scanned = sum(
            any(signal["bar_date"] == latest_bar for signal in stock["signals"])
            for stock in market_stocks
        ) if latest_bar else 0
        result.append({
            "market": market,
            "bar_date": latest_bar,
            "scanned_count": scanned,
            "total_count": len(market_stocks),
        })
    return sorted(result, key=lambda item: (_MARKET_PRIORITY.get(item["market"], 9), item["market"]))


async def build_quant_cockpit(
    db: AsyncSession,
    user_id: int,
    stocks: list[WatchStock],
) -> dict[str, Any]:
    """Consolidate enabled strategies without fetching or recalculating market data."""
    enabled_keys = await _enabled_strategy_keys(db, user_id)
    held_symbols = await _position_symbols(db, user_id)
    stock_ids = [stock.id for stock in stocks]
    history = await _latest_two_distinct_bars(db, user_id, stock_ids, enabled_keys)
    grouped_history: dict[tuple[int, str], list[QuantSignalSnapshot]] = defaultdict(list)
    for snapshot in history:
        grouped_history[(snapshot.stock_id, snapshot.strategy_key)].append(snapshot)

    stock_rows: list[dict[str, Any]] = []
    for stock in stocks:
        signals = []
        for strategy_key in enabled_keys:
            rows = grouped_history.get((stock.id, strategy_key), [])
            if not rows:
                continue
            signals.append(_evidence(rows[0], rows[1] if len(rows) > 1 else None))
        signals.sort(key=_headline_rank)
        level = _stock_level(signals)
        decision = _classify_stock(signals)
        market = infer_watch_market(stock.symbol, stock.sector)
        stock_rows.append({
            "stock_id": stock.id,
            "symbol": stock.symbol,
            "name": stock.name,
            "market": market,
            "stage": stock.stage.value,
            "has_position": _normalized_symbol(stock.symbol) in held_symbols,
            "level": level,
            "changed": any(item["changed"] for item in signals),
            "has_risk": any(item["level"] == "risk" for item in signals),
            "has_trigger": any(item["level"] == "trigger" for item in signals),
            "has_data_issue": any(item["level"] == "data_issue" for item in signals),
            "has_entry": any(item["signal"] in _ENTRY_SIGNALS for item in signals),
            "has_extended": any(
                item["signal"] in _EXTENDED_SIGNALS
                or (
                    item["signal"] == "market_baseline_deviation"
                    and (item.get("reference_gap_pct") or 0) > 0
                )
                for item in signals
            ),
            **decision,
            "headline": signals[0] if signals else None,
            "signals": signals,
        })
    stock_rows.sort(key=_operator_sort_key)

    priority_items = [
        item for item in stock_rows if item["level"] in {"risk", "trigger", "change", "data_issue"}
    ]
    successful_stock_ids = {
        item["stock_id"]
        for item in stock_rows
        if any(signal["bar_date"] and signal["level"] != "data_issue" for signal in item["signals"])
    }
    evaluated = [
        signal["evaluated_at"]
        for item in stock_rows
        for signal in item["signals"]
        if signal["evaluated_at"]
    ]
    return {
        "available_strategy_count": len(COCKPIT_STRATEGY_KEYS),
        "enabled_strategy_count": len(enabled_keys),
        "watchlist_count": len(stocks),
        "scanned_stock_count": len(successful_stock_ids),
        "last_evaluated_at": max(evaluated, default=None),
        "volume_attention_threshold": VOLUME_ATTENTION_THRESHOLD,
        "summary": {
            "entry_count": sum(item["disposition"] == "entry" for item in stock_rows),
            "watch_count": sum(item["disposition"] == "watch" for item in stock_rows),
            "extended_count": sum(item["disposition"] == "extended" for item in stock_rows),
            "risk_count": sum(item["disposition"] == "risk" for item in stock_rows),
            "trigger_count": sum(item["has_trigger"] for item in stock_rows),
            "change_count": sum(item["changed"] for item in stock_rows),
            "data_issue_count": sum(item["has_data_issue"] for item in stock_rows),
            "data_incomplete_count": sum(item["disposition"] == "data_issue" for item in stock_rows),
            "unscanned_count": max(len(stocks) - len(successful_stock_ids), 0),
        },
        "market_sessions": _market_sessions(stock_rows),
        "strategies": [
            _strategy_summary(strategy_key, stock_rows, len(stocks))
            for strategy_key in enabled_keys
        ],
        "priority_items": priority_items,
        "stocks": stock_rows if enabled_keys else [],
    }
