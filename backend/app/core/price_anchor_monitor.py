"""Manual and once-per-completed-session scans for price-anchor observations."""
import asyncio
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.market_history import completed_daily_bars, fetch_daily_bars, infer_watch_market
from app.core.quant_strategies import (
    PRICE_ANCHOR_DEFAULT_PARAMETERS,
    PRICE_ANCHOR_STRATEGY_KEY,
    PRICE_ANCHOR_STRATEGY_VERSION,
    PriceAnchorResult,
    evaluate_price_anchor,
)
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategySetting
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput, PriceAnchors

MARKET_SESSION_CUTOFFS = {
    "us": ("America/New_York", time(16, 15)),
    "hk": ("Asia/Hong_Kong", time(16, 15)),
    "cn": ("Asia/Shanghai", time(15, 15)),
    "cn_index": ("Asia/Shanghai", time(15, 15)),
    "tw": ("Asia/Taipei", time(13, 45)),
    "crypto": ("UTC", time(0, 15)),
}
PROVIDER_RETRY_INTERVAL = timedelta(hours=3)
MAX_PROVIDER_CONCURRENCY = 4


@dataclass(frozen=True, slots=True)
class AutoScanReport:
    scanned: int = 0
    skipped: int = 0
    errors: int = 0


@dataclass(frozen=True, slots=True)
class _Evaluation:
    stock: WatchStock
    result: PriceAnchorResult | None
    bar_date: str | None
    provider_error: bool = False


def _aware_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _previous_session_date(value: date, *, include_weekends: bool) -> date:
    candidate = value - timedelta(days=1)
    while not include_weekends and candidate.weekday() >= 5:
        candidate -= timedelta(days=1)
    return candidate


def latest_session_cutoff(now: datetime, market: str) -> datetime:
    timezone_name, cutoff_time = MARKET_SESSION_CUTOFFS.get(
        market, MARKET_SESSION_CUTOFFS["us"]
    )
    market_timezone = ZoneInfo(timezone_name)
    local_now = _aware_utc(now).astimezone(market_timezone)
    include_weekends = market == "crypto"
    session_date = local_now.date()
    if (not include_weekends and session_date.weekday() >= 5) or local_now.time() < cutoff_time:
        session_date = _previous_session_date(session_date, include_weekends=include_weekends)
    return datetime.combine(session_date, cutoff_time, market_timezone).astimezone(timezone.utc)


def _bar_date(value: int | str | None, exchange_timezone: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return datetime.fromtimestamp(value, timezone.utc).astimezone(ZoneInfo(exchange_timezone)).date().isoformat()
    except (OSError, OverflowError, ValueError, ZoneInfoNotFoundError):
        return datetime.fromtimestamp(value, timezone.utc).date().isoformat()


def _anchors(stock: WatchStock) -> PriceAnchors:
    return PriceAnchors(
        strike_price=float(stock.strike_price) if stock.strike_price and stock.strike_price > 0 else None,
        fair_price=float(stock.fair_price) if stock.fair_price and stock.fair_price > 0 else None,
        target_price=float(stock.target_price) if stock.target_price and stock.target_price > 0 else None,
    )


def _snapshot(
    stock: WatchStock,
    result: PriceAnchorResult | None,
    bar_date: str | None,
) -> QuantSignalSnapshot:
    if result is None:
        return QuantSignalSnapshot(
            user_id=stock.user_id,
            stock_id=stock.id,
            strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
            strategy_version=PRICE_ANCHOR_STRATEGY_VERSION,
            signal="provider_error",
            reason_codes=["market_data_unavailable"],
            metrics={},
            bar_date=None,
            source="yahoo_finance",
            execution_timing=None,
            error_code="provider_error",
        )
    return QuantSignalSnapshot(
        user_id=stock.user_id,
        stock_id=stock.id,
        strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
        strategy_version=PRICE_ANCHOR_STRATEGY_VERSION,
        signal=result.signal,
        reason_codes=result.reason_codes,
        metrics=result.metrics.model_dump(mode="json"),
        bar_date=bar_date,
        source=result.source,
        execution_timing=result.execution_timing,
        error_code=None,
    )


async def _evaluate(stock: WatchStock, market: str, now: datetime) -> _Evaluation:
    try:
        history = await asyncio.to_thread(fetch_daily_bars, stock.symbol, market, "2y")
        bars = [DailyBarInput.model_validate(item) for item in history.get("items", [])]
        default_timezone = MARKET_SESSION_CUTOFFS.get(market, MARKET_SESSION_CUTOFFS["us"])[0]
        exchange_timezone = str(history.get("exchange_timezone") or default_timezone)
        bars = completed_daily_bars(bars, exchange_timezone, now=now)
        result = evaluate_price_anchor(
            bars,
            _anchors(stock),
            PRICE_ANCHOR_DEFAULT_PARAMETERS,
            source="yahoo_finance",
        )
        return _Evaluation(
            stock=stock,
            result=result,
            bar_date=_bar_date(result.bar_date, exchange_timezone),
        )
    except Exception:
        return _Evaluation(stock=stock, result=None, bar_date=None, provider_error=True)


async def _existing_bar_snapshot(
    db: AsyncSession, user_id: int, stock_id: int, bar_date: str | None
) -> QuantSignalSnapshot | None:
    if not bar_date:
        return None
    return await db.scalar(
        select(QuantSignalSnapshot)
        .where(
            QuantSignalSnapshot.user_id == user_id,
            QuantSignalSnapshot.stock_id == stock_id,
            QuantSignalSnapshot.strategy_key == PRICE_ANCHOR_STRATEGY_KEY,
            QuantSignalSnapshot.bar_date == bar_date,
            QuantSignalSnapshot.error_code.is_(None),
        )
        .order_by(QuantSignalSnapshot.id.desc())
    )


async def scan_price_anchor_stock(
    db: AsyncSession,
    stock: WatchStock,
    market: str,
    *,
    now: datetime | None = None,
) -> QuantSignalSnapshot:
    """Run an immediate scan, reusing the saved snapshot for an unchanged bar."""
    evaluated = await _evaluate(stock, market, _aware_utc(now or datetime.now(timezone.utc)))
    existing = await _existing_bar_snapshot(db, stock.user_id, stock.id, evaluated.bar_date)
    if existing is not None:
        return existing
    snapshot = _snapshot(stock, evaluated.result, evaluated.bar_date)
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


def _is_due(snapshot: QuantSignalSnapshot | None, market: str, now: datetime) -> bool:
    if snapshot is None or snapshot.evaluated_at is None:
        return True
    evaluated_at = _aware_utc(snapshot.evaluated_at)
    if snapshot.error_code:
        return now - evaluated_at >= PROVIDER_RETRY_INTERVAL
    return evaluated_at < latest_session_cutoff(now, market)


async def scan_due_price_anchor_stocks(
    db: AsyncSession,
    *,
    now: datetime | None = None,
) -> AutoScanReport:
    """Evaluate enabled users' watchlists once per completed market session."""
    current = _aware_utc(now or datetime.now(timezone.utc))
    enabled_user_ids = list(
        (
            await db.execute(
                select(QuantStrategySetting.user_id).where(
                    QuantStrategySetting.strategy_key == PRICE_ANCHOR_STRATEGY_KEY,
                    QuantStrategySetting.enabled.is_(True),
                )
            )
        ).scalars()
    )
    if not enabled_user_ids:
        return AutoScanReport()

    stocks = list(
        (
            await db.execute(
                select(WatchStock).where(WatchStock.user_id.in_(enabled_user_ids))
            )
        ).scalars().all()
    )
    if not stocks:
        return AutoScanReport()

    stock_ids = [stock.id for stock in stocks]
    latest_ids = (
        select(func.max(QuantSignalSnapshot.id))
        .where(
            QuantSignalSnapshot.strategy_key == PRICE_ANCHOR_STRATEGY_KEY,
            QuantSignalSnapshot.stock_id.in_(stock_ids),
            QuantSignalSnapshot.user_id.in_(enabled_user_ids),
        )
        .group_by(QuantSignalSnapshot.stock_id)
    )
    latest_rows = (
        await db.execute(select(QuantSignalSnapshot).where(QuantSignalSnapshot.id.in_(latest_ids)))
    ).scalars().all()
    latest_by_stock = {row.stock_id: row for row in latest_rows}
    due: list[tuple[WatchStock, str]] = []
    for stock in stocks:
        market = infer_watch_market(stock.symbol, stock.sector)
        if _is_due(latest_by_stock.get(stock.id), market, current):
            due.append((stock, market))
    if not due:
        return AutoScanReport(skipped=len(stocks))

    semaphore = asyncio.Semaphore(MAX_PROVIDER_CONCURRENCY)

    async def evaluate_one(stock: WatchStock, market: str) -> _Evaluation:
        async with semaphore:
            return await _evaluate(stock, market, current)

    evaluations = await asyncio.gather(
        *(evaluate_one(stock, market) for stock, market in due)
    )
    scanned = 0
    errors = 0
    for evaluated in evaluations:
        existing = await _existing_bar_snapshot(
            db, evaluated.stock.user_id, evaluated.stock.id, evaluated.bar_date
        )
        if existing is not None:
            continue
        db.add(_snapshot(evaluated.stock, evaluated.result, evaluated.bar_date))
        scanned += 1
        errors += int(evaluated.provider_error)
    if scanned:
        await db.commit()
    return AutoScanReport(scanned=scanned, skipped=len(stocks) - len(due), errors=errors)
