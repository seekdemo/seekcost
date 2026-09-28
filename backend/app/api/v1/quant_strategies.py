"""Private, auditable quant-plugin API."""
import asyncio
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.market_history import completed_daily_bars, fetch_daily_bars, infer_watch_market
from app.core.quant_strategies import (
    DEFAULT_PARAMETERS,
    STRATEGY_KEY,
    STRATEGY_VERSION,
    PositionContext,
    ThreeLowQualification,
    evaluate_chang_five_day,
    VOLUME_RATIO_DEFAULT_PARAMETERS,
    VOLUME_RATIO_STRATEGY_KEY,
    VOLUME_RATIO_STRATEGY_VERSION,
    evaluate_volume_ratio,
    PRICE_ANCHOR_DEFAULT_PARAMETERS,
    PRICE_ANCHOR_STRATEGY_KEY,
    PRICE_ANCHOR_STRATEGY_VERSION,
)
from app.core.price_anchor_monitor import scan_price_anchor_stock
from app.core.security import get_current_user
from app.models.asset import Asset, AssetCategory, AssetZone
from app.models.quant_strategy import (
    QuantSignalSnapshot,
    QuantStrategyQualification,
    QuantStrategySetting,
)
from app.models.user import User
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput
from app.schemas.quant_strategy import (
    QuantQualificationOut,
    QuantQualificationWrite,
    QuantSignalSnapshotOut,
    QuantStrategyOut,
    QuantStrategyStockOut,
    QuantStrategyUpdate,
)

router = APIRouter(prefix="/quant-strategies", tags=["量化策略"])

_STRATEGY_NAME = "Five-day line observation"
_VOLUME_RATIO_NAME = "Three-day volume ratio"
_PRICE_ANCHOR_NAME = "Price anchor observation"
_DISCLAIMER = "Evidence for review only. This is not investment advice."
_DATA_BOUNDARY = "Completed daily bars only; actionable signals are reviewed at the next session open."
_MARKET_TIMEZONES = {
    "us": "America/New_York",
    "hk": "Asia/Hong_Kong",
    "cn": "Asia/Shanghai",
    "cn_index": "Asia/Shanghai",
    "tw": "Asia/Taipei",
}


@dataclass(frozen=True, slots=True)
class _StrategyDefinition:
    key: str
    name: str
    version: str
    parameters: Any
    disclaimer: str
    data_boundary: str


_STRATEGIES = {
    STRATEGY_KEY: _StrategyDefinition(
        key=STRATEGY_KEY,
        name=_STRATEGY_NAME,
        version=STRATEGY_VERSION,
        parameters=DEFAULT_PARAMETERS,
        disclaimer=_DISCLAIMER,
        data_boundary=_DATA_BOUNDARY,
    ),
    VOLUME_RATIO_STRATEGY_KEY: _StrategyDefinition(
        key=VOLUME_RATIO_STRATEGY_KEY,
        name=_VOLUME_RATIO_NAME,
        version=VOLUME_RATIO_STRATEGY_VERSION,
        parameters=VOLUME_RATIO_DEFAULT_PARAMETERS,
        disclaimer="Observation only. This is not investment advice.",
        data_boundary="Uses the latest completed daily bar and compares its volume with the three completed sessions before it.",
    ),
    PRICE_ANCHOR_STRATEGY_KEY: _StrategyDefinition(
        key=PRICE_ANCHOR_STRATEGY_KEY,
        name=_PRICE_ANCHOR_NAME,
        version=PRICE_ANCHOR_STRATEGY_VERSION,
        parameters=PRICE_ANCHOR_DEFAULT_PARAMETERS,
        disclaimer="Observation only. This is not investment advice.",
        data_boundary="Uses completed daily bars only; enabled strategies are checked automatically after each market session.",
    ),
}


def _ensure_strategy(strategy_key: str) -> _StrategyDefinition:
    definition = _STRATEGIES.get(strategy_key)
    if definition is None:
        raise HTTPException(status_code=404, detail="量化策略不存在")
    return definition


def _normalized_symbol(symbol: str) -> str:
    normalized = symbol.strip().strip('"').upper()
    for suffix in (".US", ".HK", ".SH", ".SZ", ".SS", ".TW", ".TWO", ".BJ"):
        if normalized.endswith(suffix):
            return normalized[: -len(suffix)]
    return normalized.replace("-USD", "")


def _qualification_values(
    row: QuantStrategyQualification | None,
) -> ThreeLowQualification:
    if row is None:
        return ThreeLowQualification()
    return ThreeLowQualification(row.historical_low, row.valuation_low, row.attention_low)


def _qualification_out(
    stock_id: int,
    row: QuantStrategyQualification | None,
) -> QuantQualificationOut:
    values = _qualification_values(row)
    return QuantQualificationOut(
        stock_id=stock_id,
        historical_low=values.historical_low,
        valuation_low=values.valuation_low,
        attention_low=values.attention_low,
        note=row.note if row else "",
        complete=values.is_complete,
        qualified=values.is_qualified,
        updated_at=row.updated_at if row else None,
    )


def _strategy_out(definition: _StrategyDefinition, setting: QuantStrategySetting | None) -> QuantStrategyOut:
    return QuantStrategyOut(
        strategy_key=definition.key,
        name=definition.name,
        strategy_version=definition.version,
        enabled=bool(setting and setting.enabled),
        parameters=definition.parameters.model_dump(mode="json"),
        disclaimer=definition.disclaimer,
        data_boundary=definition.data_boundary,
        updated_at=setting.updated_at if setting else None,
    )


def _bar_date(value: int | str | None, exchange_timezone: str) -> str | None:
    if value is None:
        return None
    if isinstance(value, str):
        return value
    try:
        return datetime.fromtimestamp(value, timezone.utc).astimezone(ZoneInfo(exchange_timezone)).date().isoformat()
    except (OSError, OverflowError, ValueError, ZoneInfoNotFoundError):
        return datetime.fromtimestamp(value, timezone.utc).date().isoformat()


async def _setting(db: AsyncSession, user_id: int, strategy_key: str) -> QuantStrategySetting | None:
    return await db.scalar(
        select(QuantStrategySetting).where(
            QuantStrategySetting.user_id == user_id,
            QuantStrategySetting.strategy_key == strategy_key,
        )
    )


async def _owned_stock(stock_id: int, db: AsyncSession, user_id: int) -> WatchStock:
    stock = await db.scalar(
        select(WatchStock).where(WatchStock.id == stock_id, WatchStock.user_id == user_id)
    )
    if stock is None:
        raise HTTPException(status_code=404, detail="股票池标的不存在")
    return stock


async def _owned_positions(
    stocks: list[WatchStock], db: AsyncSession, user_id: int
) -> dict[int, tuple[PositionContext, str]]:
    assets = list(
        (
            await db.execute(
                select(Asset).where(
                    Asset.user_id == user_id,
                    Asset.zone == AssetZone.ACTIVE,
                    Asset.category.in_([AssetCategory.STOCK, AssetCategory.ETF]),
                    Asset.archived.is_(False),
                    Asset.is_cash.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    assets_by_symbol: dict[str, list[Asset]] = {}
    for asset in assets:
        assets_by_symbol.setdefault(_normalized_symbol(asset.symbol), []).append(asset)

    positions: dict[int, tuple[PositionContext, str]] = {}
    for stock in stocks:
        matches = assets_by_symbol.get(_normalized_symbol(stock.symbol), [])
        held = [asset for asset in matches if float(asset.quantity) > 0]
        market_asset = held[0] if held else (matches[0] if matches else None)
        fallback_market = infer_watch_market(stock.symbol, stock.sector)
        if market_asset is None:
            positions[stock.id] = (PositionContext(), fallback_market)
            continue
        priced_positions = [asset for asset in held if float(asset.broker_cost) > 0]
        priced_quantity = sum(float(asset.quantity) for asset in priced_positions)
        cost_basis = (
            sum(float(asset.broker_cost) * float(asset.quantity) for asset in priced_positions)
            / priced_quantity
            if priced_quantity > 0
            else None
        )
        market = str(
            market_asset.market.value
            if hasattr(market_asset.market, "value")
            else market_asset.market or ""
        )
        if market not in _MARKET_TIMEZONES and market != "crypto":
            market = fallback_market
        positions[stock.id] = (
            PositionContext(has_position=bool(held), cost_basis=cost_basis),
            market or fallback_market,
        )
    return positions


async def _qualification(
    stock_id: int, db: AsyncSession, user_id: int, strategy_key: str
) -> QuantStrategyQualification | None:
    return await db.scalar(
        select(QuantStrategyQualification).where(
            QuantStrategyQualification.user_id == user_id,
            QuantStrategyQualification.strategy_key == strategy_key,
            QuantStrategyQualification.stock_id == stock_id,
        )
    )


async def _append_snapshot(
    db: AsyncSession,
    *,
    strategy_key: str,
    strategy_version: str,
    user_id: int,
    stock_id: int,
    signal: str,
    reason_codes: list[str],
    metrics: dict,
    bar_date: str | None,
    source: str,
    execution_timing: str | None = None,
    error_code: str | None = None,
) -> QuantSignalSnapshot:
    snapshot = QuantSignalSnapshot(
        user_id=user_id,
        stock_id=stock_id,
        strategy_key=strategy_key,
        strategy_version=strategy_version,
        signal=signal,
        reason_codes=reason_codes,
        metrics=metrics,
        bar_date=bar_date,
        source=source,
        execution_timing=execution_timing,
        error_code=error_code,
    )
    db.add(snapshot)
    await db.commit()
    await db.refresh(snapshot)
    return snapshot


@router.get("", response_model=list[QuantStrategyOut])
@router.get("/", response_model=list[QuantStrategyOut], include_in_schema=False)
async def list_quant_strategies(
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)
):
    return [_strategy_out(definition, await _setting(db, user.id, definition.key)) for definition in _STRATEGIES.values()]


@router.patch("/{strategy_key}", response_model=QuantStrategyOut)
async def update_quant_strategy(
    strategy_key: str,
    body: QuantStrategyUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    definition = _ensure_strategy(strategy_key)
    setting = await _setting(db, user.id, strategy_key)
    if setting is None:
        setting = QuantStrategySetting(
            user_id=user.id, strategy_key=definition.key, enabled=body.enabled
        )
        db.add(setting)
    else:
        setting.enabled = body.enabled
    await db.commit()
    await db.refresh(setting)
    return _strategy_out(definition, setting)


@router.get("/{strategy_key}/stocks", response_model=list[QuantStrategyStockOut])
async def list_quant_strategy_stocks(
    strategy_key: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    definition = _ensure_strategy(strategy_key)
    stocks = list(
        (
            await db.execute(
                select(WatchStock)
                .where(WatchStock.user_id == user.id)
                .order_by(WatchStock.symbol)
            )
        )
        .scalars()
        .all()
    )
    stock_ids = [stock.id for stock in stocks]
    qualifications: dict[int, QuantStrategyQualification] = {}
    snapshots: dict[int, QuantSignalSnapshot] = {}
    if stock_ids:
        qualification_rows = (
            await db.execute(
                select(QuantStrategyQualification).where(
                    QuantStrategyQualification.user_id == user.id,
                    QuantStrategyQualification.strategy_key == definition.key,
                    QuantStrategyQualification.stock_id.in_(stock_ids),
                )
            )
        ).scalars().all()
        qualifications = {row.stock_id: row for row in qualification_rows}
        latest_snapshot_ids = (
            select(func.max(QuantSignalSnapshot.id))
            .where(
                QuantSignalSnapshot.user_id == user.id,
                QuantSignalSnapshot.strategy_key == definition.key,
                QuantSignalSnapshot.stock_id.in_(stock_ids),
            )
            .group_by(QuantSignalSnapshot.stock_id)
        )
        snapshot_rows = (
            await db.execute(
                select(QuantSignalSnapshot).where(QuantSignalSnapshot.id.in_(latest_snapshot_ids))
            )
        ).scalars().all()
        snapshots = {row.stock_id: row for row in snapshot_rows}
    result: list[QuantStrategyStockOut] = []
    positions = await _owned_positions(stocks, db, user.id)
    for stock in stocks:
        position, market = positions[stock.id]
        result.append(
            QuantStrategyStockOut(
                stock_id=stock.id,
                symbol=stock.symbol,
                name=stock.name,
                stage=stock.stage.value,
                market=market,
                has_position=position.has_position,
                qualification=_qualification_out(stock.id, qualifications.get(stock.id)),
                latest_snapshot=snapshots.get(stock.id),
            )
        )
    return result


@router.put(
    "/{strategy_key}/stocks/{stock_id}/qualification",
    response_model=QuantQualificationOut,
)
async def update_quant_qualification(
    strategy_key: str,
    stock_id: int,
    body: QuantQualificationWrite,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    definition = _ensure_strategy(strategy_key)
    if definition.key != STRATEGY_KEY:
        raise HTTPException(status_code=409, detail="该观察策略不需要三低资格设置")
    await _owned_stock(stock_id, db, user.id)
    row = await _qualification(stock_id, db, user.id, strategy_key)
    if row is None:
        row = QuantStrategyQualification(
            user_id=user.id,
            strategy_key=definition.key,
            stock_id=stock_id,
            **body.model_dump(),
        )
        db.add(row)
    else:
        for key, value in body.model_dump().items():
            setattr(row, key, value)
    await db.commit()
    await db.refresh(row)
    return _qualification_out(stock_id, row)


@router.post(
    "/{strategy_key}/stocks/{stock_id}/scan",
    response_model=QuantSignalSnapshotOut,
)
async def scan_quant_stock(
    strategy_key: str,
    stock_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    definition = _ensure_strategy(strategy_key)
    setting = await _setting(db, user.id, strategy_key)
    if setting is None or not setting.enabled:
        raise HTTPException(status_code=409, detail="请先启用量化策略")
    stock = await _owned_stock(stock_id, db, user.id)
    position, market = (await _owned_positions([stock], db, user.id))[stock.id]

    if definition.key == PRICE_ANCHOR_STRATEGY_KEY:
        return await scan_price_anchor_stock(db, stock, market)

    try:
        history = await asyncio.to_thread(fetch_daily_bars, stock.symbol, market, "2y")
        bars = [DailyBarInput.model_validate(item) for item in history.get("items", [])]
        exchange_timezone = str(
            history.get("exchange_timezone") or _MARKET_TIMEZONES.get(market, "UTC")
        )
        bars = completed_daily_bars(bars, exchange_timezone)
        if definition.key == STRATEGY_KEY:
            result = evaluate_chang_five_day(
                bars,
                # Kept for the backwards-compatible evaluator signature. Qualification
                # is no longer a scan gate; every watchlist stock is monitored.
                ThreeLowQualification(),
                position,
                DEFAULT_PARAMETERS,
                source="yahoo_finance",
            )
        else:
            result = evaluate_volume_ratio(
                bars,
                VOLUME_RATIO_DEFAULT_PARAMETERS,
                source="yahoo_finance",
            )
    except Exception:
        return await _append_snapshot(
            db,
            strategy_key=definition.key,
            strategy_version=definition.version,
            user_id=user.id,
            stock_id=stock.id,
            signal="provider_error",
            reason_codes=["market_data_unavailable"],
            metrics={},
            bar_date=None,
            source="yahoo_finance",
            error_code="provider_error",
        )
    return await _append_snapshot(
        db,
        strategy_key=definition.key,
        strategy_version=definition.version,
        user_id=user.id,
        stock_id=stock.id,
        signal=result.signal,
        reason_codes=result.reason_codes,
        metrics=result.metrics.model_dump(mode="json"),
        bar_date=_bar_date(result.bar_date, exchange_timezone),
        source=result.source,
        execution_timing=result.execution_timing,
    )
