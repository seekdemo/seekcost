"""Automatic completed-session volume snapshots for the Decision inbox."""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.market_history import completed_daily_bars, fetch_daily_bars, infer_watch_market
from app.core.price_anchor_monitor import (
    AutoScanReport, MARKET_SESSION_CUTOFFS, MAX_PROVIDER_CONCURRENCY,
    _aware_utc, _bar_date, _is_due, latest_session_cutoff,
)
from app.models.quant_strategy import QuantSignalSnapshot
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput

VOLUME_WATCH_STRATEGY_KEY = "daily-volume-watch"
VOLUME_WATCH_STRATEGY_VERSION = "1.0"
DEFAULT_VOLUME_THRESHOLD = 1.5


def evaluate_daily_volume(bars: list[DailyBarInput]) -> dict:
    """Compare the two most recent completed *trading* sessions, not calendar days."""
    latest = bars[-1] if bars else None
    previous = bars[-2] if len(bars) >= 2 else None
    latest_volume = float(latest.volume or 0) if latest else None
    previous_volume = float(previous.volume or 0) if previous else None
    return {
        "bar_date": str(latest.date) if latest else None,
        "latest_volume": latest_volume,
        "previous_volume": previous_volume,
        "ratio": round(latest_volume / previous_volume, 6)
        if latest_volume and previous_volume and latest_volume > 0 and previous_volume > 0 else None,
    }


@dataclass(frozen=True, slots=True)
class _Evaluation:
    stock: WatchStock
    metrics: dict
    provider_error: bool = False


async def _evaluate(stock: WatchStock, market: str, now: datetime) -> _Evaluation:
    try:
        history = await asyncio.to_thread(fetch_daily_bars, stock.symbol, market, "1mo")
        default_timezone = MARKET_SESSION_CUTOFFS.get(market, MARKET_SESSION_CUTOFFS["us"])[0]
        timezone_name = str(history.get("exchange_timezone") or default_timezone)
        try:
            ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            timezone_name = default_timezone
        bars = completed_daily_bars(
            [DailyBarInput.model_validate(item) for item in history.get("items", [])],
            timezone_name, now=now,
            cutoff_time=MARKET_SESSION_CUTOFFS.get(market, MARKET_SESSION_CUTOFFS["us"])[1],
        )
        metrics = evaluate_daily_volume(bars)
        metrics["bar_date"] = _bar_date(bars[-1].date, timezone_name) if bars else None
        expected_date = latest_session_cutoff(now, market).astimezone(ZoneInfo(default_timezone)).date().isoformat()
        if not metrics["bar_date"] or metrics["bar_date"] < expected_date:
            # A provider can still serve yesterday's bar just after the close.
            # Retry later instead of silently treating the new session as scanned.
            return _Evaluation(stock, {}, provider_error=True)
        return _Evaluation(stock, metrics)
    except Exception:
        return _Evaluation(stock, {}, provider_error=True)


async def scan_due_volume_watch_stocks(db: AsyncSession, *, now: datetime | None = None) -> AutoScanReport:
    """Scan every user's watchlist at most once per completed market session."""
    current = _aware_utc(now or datetime.now(timezone.utc))
    stocks = list((await db.execute(select(WatchStock))).scalars().all())
    if not stocks:
        return AutoScanReport()
    latest_ids = (
        select(func.max(QuantSignalSnapshot.id))
        .where(QuantSignalSnapshot.strategy_key == VOLUME_WATCH_STRATEGY_KEY,
               QuantSignalSnapshot.stock_id.in_([stock.id for stock in stocks]))
        .group_by(QuantSignalSnapshot.stock_id)
    )
    latest = (await db.execute(select(QuantSignalSnapshot).where(QuantSignalSnapshot.id.in_(latest_ids)))).scalars().all()
    latest_by_stock = {row.stock_id: row for row in latest}
    due = []
    for stock in stocks:
        market = infer_watch_market(stock.symbol, stock.sector)
        if _is_due(latest_by_stock.get(stock.id), market, current):
            due.append((stock, market))
    if not due:
        return AutoScanReport(skipped=len(stocks))
    semaphore = asyncio.Semaphore(MAX_PROVIDER_CONCURRENCY)

    async def one(stock: WatchStock, market: str) -> _Evaluation:
        async with semaphore:
            return await _evaluate(stock, market, current)

    evaluations = await asyncio.gather(*(one(stock, market) for stock, market in due))
    for item in evaluations:
        metrics = item.metrics
        db.add(QuantSignalSnapshot(
            user_id=item.stock.user_id, stock_id=item.stock.id,
            strategy_key=VOLUME_WATCH_STRATEGY_KEY,
            strategy_version=VOLUME_WATCH_STRATEGY_VERSION,
            signal="provider_error" if item.provider_error else "volume_observation" if metrics.get("ratio") is not None else "insufficient_data",
            reason_codes=["market_data_unavailable"] if item.provider_error else [],
            metrics=metrics, bar_date=metrics.get("bar_date"),
            source="yahoo_finance", execution_timing="post_close",
            error_code="provider_error" if item.provider_error else None,
            evaluated_at=current,
        ))
    await db.commit()
    return AutoScanReport(scanned=len(evaluations), skipped=len(stocks) - len(due), errors=sum(item.provider_error for item in evaluations))


async def volume_watch_overview(db: AsyncSession, user_id: int, stocks: list[WatchStock], now: datetime) -> dict:
    from app.models.volume_watch import VolumeWatchSetting

    setting = await db.scalar(select(VolumeWatchSetting).where(VolumeWatchSetting.user_id == user_id))
    threshold = float(setting.threshold) if setting else DEFAULT_VOLUME_THRESHOLD
    if not stocks:
        return {"threshold": threshold, "items": [], "scanned_count": 0, "total_count": 0, "last_evaluated_at": None}
    latest_ids = (
        select(func.max(QuantSignalSnapshot.id))
        .where(QuantSignalSnapshot.user_id == user_id,
               QuantSignalSnapshot.strategy_key == VOLUME_WATCH_STRATEGY_KEY,
               QuantSignalSnapshot.stock_id.in_([stock.id for stock in stocks]))
        .group_by(QuantSignalSnapshot.stock_id)
    )
    rows = (await db.execute(select(QuantSignalSnapshot).where(QuantSignalSnapshot.id.in_(latest_ids)))).scalars().all()
    stock_by_id = {stock.id: stock for stock in stocks}
    items = []
    scanned = 0
    evaluated = []
    for row in rows:
        stock = stock_by_id.get(row.stock_id)
        if not stock or row.error_code or not row.bar_date:
            continue
        market = infer_watch_market(stock.symbol, stock.sector)
        # Avoid displaying a previous session's observation as if it were today's.
        cutoff = latest_session_cutoff(now, market)
        timezone_name = MARKET_SESSION_CUTOFFS.get(market, MARKET_SESSION_CUTOFFS["us"])[0]
        expected_date = cutoff.astimezone(ZoneInfo(timezone_name)).date().isoformat()
        if (row.evaluated_at and _aware_utc(row.evaluated_at) < cutoff) or row.bar_date < expected_date:
            continue
        scanned += 1
        evaluated.append(row.evaluated_at)
        metrics = row.metrics or {}
        ratio = metrics.get("ratio")
        if ratio is not None and float(ratio) >= threshold:
            items.append({
                "stock_id": stock.id, "symbol": stock.symbol, "name": stock.name,
                "ratio": float(ratio), "latest_volume": metrics.get("latest_volume"),
                "previous_volume": metrics.get("previous_volume"), "bar_date": row.bar_date,
            })
    items.sort(key=lambda item: (-item["ratio"], item["symbol"]))
    return {
        "threshold": threshold, "items": items, "scanned_count": scanned,
        "total_count": len(stocks),
        "last_evaluated_at": max((value.isoformat() for value in evaluated if value), default=None),
    }
