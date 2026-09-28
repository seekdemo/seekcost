"""个人投资工作台聚合。只返回当前用户的可执行事项。"""
import asyncio
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, Query
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.intraday_monitor import evaluate_intraday_preview
from app.core.intraday_preview_cache import IntradayPreviewCache
from app.core.market_history import completed_daily_bars, fetch_daily_bars, fetch_intraday_bars, infer_watch_market
from app.core.price_updater import get_market_session
from app.core.process_capacity_limiter import ProcessCapacityLimiter
from app.core.quant_cockpit import build_quant_cockpit
from app.core.quant_strategies import PRICE_ANCHOR_STRATEGY_KEY, STRATEGY_KEY
from app.core.security import get_current_user
from app.models.asset import Asset, AssetCategory, AssetZone
from app.models.cash_account import CashAccount
from app.models.note import Note, ResearchLink
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategySetting
from app.models.trade_plan import PlanStatus, TradePlan
from app.models.transaction import Transaction
from app.models.user import User
from app.models.watchlist import WatchStage, WatchStock
from app.schemas.prices import DailyBarInput

router = APIRouter(prefix="/workbench", tags=["投资工作台"])

_WORKBENCH_QUANT_STRATEGIES = (STRATEGY_KEY, PRICE_ANCHOR_STRATEGY_KEY)
_INTRADAY_PREVIEW_LIMIT = 24
_INTRADAY_PREVIEW_CONCURRENCY = 6
_intraday_preview_capacity = ProcessCapacityLimiter(_INTRADAY_PREVIEW_CONCURRENCY)

intraday_preview_cache = IntradayPreviewCache()


def _normalized_asset_symbol(symbol: str) -> str:
    normalized = (symbol or "").strip().strip('"').upper()
    for suffix in (".US", ".HK", ".SH", ".SZ", ".SS", ".TW", ".TWO", ".BJ"):
        if normalized.endswith(suffix):
            return normalized[: -len(suffix)]
    return normalized.replace("-USD", "")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


@router.get("/overview")
async def get_workbench_overview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now = datetime.now(timezone.utc)
    review_limit = now + timedelta(days=7)
    stale_limit = now - timedelta(days=14)

    stocks = (await db.execute(
        select(WatchStock).where(WatchStock.user_id == user.id).order_by(WatchStock.updated_at.asc())
    )).scalars().all()
    stock_ids = [stock.id for stock in stocks]
    quant_cockpit = await build_quant_cockpit(db, user.id, list(stocks))

    # Keep the home page useful for the whole investment ledger, not only the
    # stock workflow. Values are intentionally returned with their account
    # currencies so a mixed-currency balance is never presented as one fake
    # converted total.
    capital_totals = (await db.execute(
        select(
            func.coalesce(func.sum(Asset.actual_investment), 0),
            func.coalesce(func.sum(Asset.planned_investment), 0),
        ).where(Asset.user_id == user.id, Asset.zone.in_(["active", "base"]))
    )).one()
    cash_accounts = (await db.execute(
        select(CashAccount).where(
            CashAccount.user_id == user.id,
            CashAccount.is_active.is_(True),
        ).order_by(CashAccount.currency.asc(), CashAccount.name.asc())
    )).scalars().all()
    stage_counts = {stage.value: 0 for stage in WatchStage}
    for stock in stocks:
        stage_counts[stock.stage.value] = stage_counts.get(stock.stage.value, 0) + 1

    # The workbench only needs the latest saved snapshot per strategy and stock. It never
    # triggers a market-data request, so opening the home page stays cheap and
    # predictable while still surfacing the latest quant evidence.
    latest_quant_ids = (
        select(func.max(QuantSignalSnapshot.id))
        .where(
            QuantSignalSnapshot.user_id == user.id,
            QuantSignalSnapshot.strategy_key.in_(_WORKBENCH_QUANT_STRATEGIES),
            QuantSignalSnapshot.stock_id.in_(stock_ids),
        )
        .group_by(QuantSignalSnapshot.strategy_key, QuantSignalSnapshot.stock_id)
    )
    quant_rows = (await db.execute(
        select(QuantSignalSnapshot).where(QuantSignalSnapshot.id.in_(latest_quant_ids))
    )).scalars().all()
    quant_settings = (await db.execute(
        select(QuantStrategySetting).where(
            QuantStrategySetting.user_id == user.id,
            QuantStrategySetting.strategy_key.in_(_WORKBENCH_QUANT_STRATEGIES),
        )
    )).scalars().all()
    strike_candidates = []
    stale_stocks = []
    incomplete_stocks = []
    upcoming_events = []
    today = date.today()
    for stock in stocks:
        current = float(stock.current_price or 0)
        strike = float(stock.strike_price or 0)
        near_strike = bool(strike and current and current <= strike * 1.02)
        if stock.stage == WatchStage.STRIKE or near_strike:
            strike_candidates.append({
                "id": stock.id, "symbol": stock.symbol, "name": stock.name,
                "current_price": current, "strike_price": strike,
            })
        updated_at = stock.updated_at
        if updated_at and updated_at.tzinfo is None:
            updated_at = updated_at.replace(tzinfo=timezone.utc)
        if updated_at and updated_at <= stale_limit and stock.stage != WatchStage.STRIKE:
            stale_stocks.append({"id": stock.id, "symbol": stock.symbol, "name": stock.name, "updated_at": _iso(stock.updated_at)})
        if not (stock.thesis or "").strip() or not (stock.invalidation or "").strip():
            incomplete_stocks.append({
                "id": stock.id, "symbol": stock.symbol, "name": stock.name,
                "missing": [field for value, field in ((stock.thesis, "thesis"), (stock.invalidation, "invalidation")) if not (value or "").strip()],
            })
        for milestone in stock.milestones or []:
            if milestone.get("done") or not milestone.get("date"):
                continue
            try:
                event_date = date.fromisoformat(str(milestone["date"])[:10])
            except ValueError:
                continue
            delta = (event_date - today).days
            if 0 <= delta <= 7:
                upcoming_events.append({
                    "stock_id": stock.id, "symbol": stock.symbol,
                    "title": milestone.get("title") or "", "date": event_date.isoformat(), "days": delta,
                })

    due_notes = (await db.execute(
        select(Note).where(
            Note.user_id == user.id,
            Note.next_review_at.is_not(None),
            Note.next_review_at <= review_limit,
            Note.status != "archived",
        ).order_by(Note.next_review_at.asc()).limit(12)
    )).scalars().all()

    active_plans = (await db.execute(
        select(TradePlan, Asset)
        .join(Asset, Asset.id == TradePlan.asset_id)
        .where(Asset.user_id == user.id, TradePlan.status == PlanStatus.ACTIVE)
        .order_by(TradePlan.updated_at.desc())
        .limit(12)
    )).all()

    reviewed_tx_ids = select(ResearchLink.entity_id).where(
        ResearchLink.user_id == user.id, ResearchLink.entity_type == "transaction"
    )
    recent_transactions = (await db.execute(
        select(Transaction, Asset)
        .join(Asset, Asset.id == Transaction.asset_id)
        .where(
            Asset.user_id == user.id,
            Transaction.created_at >= now - timedelta(days=14),
            Transaction.id.not_in(reviewed_tx_ids),
        )
        .order_by(Transaction.created_at.desc())
        .limit(12)
    )).all()

    stock_by_id = {stock.id: stock for stock in stocks}
    signal_priority = {
        "risk_exit": 0,
        "anchor_risk": 0,
        "entry_breakout": 1,
        "entry_pullback": 1,
        "anchor_strike_zone": 1,
        "anchor_target_zone": 1,
        "anchor_fair_zone": 2,
        "market_baseline_deviation": 2,
        "trend_warning": 2,
        "provider_error": 3,
        "insufficient_data": 3,
        "hold_trend": 4,
        "anchor_watch": 5,
        "watch": 5,
    }
    quant_signals = []
    for snapshot in quant_rows:
        stock = stock_by_id.get(snapshot.stock_id)
        if stock is None:
            continue
        quant_signals.append({
            "stock_id": stock.id,
            "symbol": stock.symbol,
            "name": stock.name,
            "strategy_key": snapshot.strategy_key,
            "signal": snapshot.signal,
            "reason_codes": snapshot.reason_codes or [],
            "bar_date": snapshot.bar_date,
            "evaluated_at": _iso(snapshot.evaluated_at),
        })
    quant_signals.sort(
        key=lambda item: (
            signal_priority.get(item["signal"], 6),
            item["evaluated_at"] or "",
        )
    )
    quant_attention_signals = {
        "risk_exit", "anchor_risk", "trend_warning", "provider_error", "insufficient_data",
    }
    quant_match_signals = {
        "entry_breakout", "entry_pullback", "hold_trend", "anchor_strike_zone",
        "anchor_fair_zone", "anchor_target_zone", "market_baseline_deviation",
    }
    visible_quant_signals = [
        item
        for item in quant_signals
        if item["signal"] in quant_attention_signals | quant_match_signals
    ]
    scanned_stock_count = len({item["stock_id"] for item in quant_signals})

    return {
        "generated_at": now.isoformat(),
        "quant_cockpit": quant_cockpit,
        "strike_candidates": strike_candidates[:12],
        "upcoming_events": sorted(upcoming_events, key=lambda item: (item["date"], item["symbol"]))[:12],
        "due_research": [
            {"id": note.id, "title": note.title, "kind": note.kind, "status": note.status, "next_review_at": _iso(note.next_review_at)}
            for note in due_notes
        ],
        "stale_stocks": stale_stocks[:12],
        "incomplete_stocks": incomplete_stocks[:12],
        "active_plans": [
            {"id": plan.id, "asset_id": asset.id, "symbol": asset.symbol, "name": asset.name, "updated_at": _iso(plan.updated_at)}
            for plan, asset in active_plans
        ],
        "unreviewed_transactions": [
            {
                "id": tx.id, "asset_id": asset.id, "symbol": asset.symbol, "name": asset.name,
                "tx_type": tx.tx_type.value, "created_at": _iso(tx.created_at),
            }
            for tx, asset in recent_transactions
        ],
        "capital": {
            "actual_investment": float(capital_totals[0] or 0),
            "planned_investment": float(capital_totals[1] or 0),
            "cash_accounts": [
                {"name": account.name, "balance": float(account.balance or 0), "currency": account.currency}
                for account in cash_accounts
            ],
        },
        "watchlist_summary": {
            "total": len(stocks),
            "radar": stage_counts.get(WatchStage.RADAR.value, 0),
            "conviction": stage_counts.get(WatchStage.CONVICTION.value, 0),
            "strike": stage_counts.get(WatchStage.STRIKE.value, 0),
        },
        "quant_monitoring": {
            "enabled": any(setting.enabled for setting in quant_settings),
            "watchlist_count": len(stock_ids),
            "scanned_count": scanned_stock_count,
            "matches_count": sum(1 for item in quant_signals if item["signal"] in quant_match_signals),
            "attention_count": sum(1 for item in quant_signals if item["signal"] in quant_attention_signals)
            + max(len(stock_ids) - scanned_stock_count, 0),
            "last_evaluated_at": max((item["evaluated_at"] for item in quant_signals if item["evaluated_at"]), default=None),
            "signals": visible_quant_signals[:8],
        },
    }


def _watch_stock_snapshot(stock: WatchStock) -> dict:
    return {
        "id": stock.id,
        "symbol": stock.symbol,
        "name": stock.name,
        "sector": stock.sector or "",
        "current_price": float(stock.current_price or 0) or None,
        "strike_price": float(stock.strike_price or 0) or None,
        "fair_price": float(stock.fair_price or 0) or None,
        "target_price": float(stock.target_price or 0) or None,
    }


def _position_snapshot(position: Asset | None) -> dict | None:
    if position is None:
        return None
    return {
        "broker_cost": float(position.broker_cost or 0) or None,
        "quantity": float(position.quantity or 0),
    }


async def _intraday_preview_item(stock: dict, position: dict | None) -> dict:
    market = infer_watch_market(stock["symbol"], stock["sector"])
    try:
        intraday_payload, daily_payload = await asyncio.gather(
            asyncio.to_thread(fetch_intraday_bars, stock["symbol"], market, "5m", "5d"),
            asyncio.to_thread(fetch_daily_bars, stock["symbol"], market, "6mo"),
            return_exceptions=True,
        )
        for provider_result in (intraday_payload, daily_payload):
            if isinstance(provider_result, BaseException):
                raise provider_result
        exchange_timezone = intraday_payload.get("exchange_timezone") or {
            "us": "America/New_York",
            "hk": "Asia/Hong_Kong",
            "cn": "Asia/Shanghai",
            "cn_index": "Asia/Shanghai",
            "tw": "Asia/Taipei",
        }.get(market, "America/New_York")
        daily_items = daily_payload.get("items") or []
        try:
            daily_items = [
                item.model_dump()
                for item in completed_daily_bars(
                    [DailyBarInput.model_validate(item) for item in daily_items],
                    exchange_timezone,
                )
            ]
        except Exception:
            daily_items = []
        current_price = stock["current_price"]
        if current_price is None and intraday_payload.get("items"):
            current_price = float(intraday_payload["items"][-1].get("close") or 0) or None
        result = evaluate_intraday_preview(
            symbol=stock["symbol"],
            market=market,
            intraday_items=intraday_payload.get("items") or [],
            daily_bars=daily_items,
            current_price=current_price,
            strike_price=stock["strike_price"],
            fair_price=stock["fair_price"],
            target_price=stock["target_price"],
            position_cost=position["broker_cost"] if position else None,
            position_quantity=position["quantity"] if position else 0,
            exchange_timezone=exchange_timezone,
        )
        return {
            "stock_id": stock["id"],
            "symbol": stock["symbol"],
            "name": stock["name"],
            "market": market,
            "current_price": result["evidence"].get("current_price"),
            "status": result["status"],
            "warning_code": result["warning_code"],
            "severity": result["severity"],
            "is_provisional": result["is_provisional"],
            "session": result["session"],
            "evidence": result["evidence"],
            "error_code": result["error_code"],
        }
    except Exception as error:  # provider failures are isolated to one symbol
        return {
            "stock_id": stock["id"],
            "symbol": stock["symbol"],
            "name": stock["name"],
            "market": market,
            "current_price": stock["current_price"],
            "status": "pending_close",
            "warning_code": "data_unavailable",
            "severity": "info",
            "is_provisional": True,
            "session": None,
            "evidence": {},
            "error_code": "provider_error",
            "provider_message": str(error)[:160],
        }


def _empty_intraday_preview_payload(snapshots: list[dict]) -> dict:
    selected = snapshots[:_INTRADAY_PREVIEW_LIMIT]
    return {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "is_market_open": any(
            get_market_session(infer_watch_market(item["stock"]["symbol"], item["stock"]["sector"])) == "regular"
            for item in snapshots
        ),
        "items": [],
        "provider_errors": 0,
        "requested_count": len(selected),
        "total_count": len(snapshots),
    }


async def _build_intraday_preview_payload(snapshots: list[dict]) -> dict:
    selected = snapshots[:_INTRADAY_PREVIEW_LIMIT]

    async def guarded(item: dict) -> dict:
        async with _intraday_preview_capacity:
            return await _intraday_preview_item(item["stock"], item["position"])

    results = await asyncio.gather(*(guarded(item) for item in selected))
    if len(snapshots) > len(selected):
        results.extend({
            "stock_id": item["stock"]["id"],
            "symbol": item["stock"]["symbol"],
            "name": item["stock"]["name"],
            "market": infer_watch_market(item["stock"]["symbol"], item["stock"]["sector"]),
            "current_price": item["stock"]["current_price"],
            "status": "pending_close",
            "warning_code": "not_requested",
            "severity": "info",
            "is_provisional": True,
            "session": None,
            "evidence": {},
            "error_code": "request_limit",
        } for item in snapshots[len(selected):])
    return {
        **_empty_intraday_preview_payload(snapshots),
        "items": results,
        "provider_errors": sum(
            1 for item in results
            if item.get("error_code") in {"provider_error", "intraday_bars_unavailable"}
        ),
    }


@router.get("/intraday-preview")
async def get_workbench_intraday_preview(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    refresh: bool = Query(False),
):
    """Return provisional intraday warnings without persisting a signal snapshot."""
    stocks = (await db.execute(
        select(WatchStock)
        .where(WatchStock.user_id == user.id)
        .order_by(
            case(
                (WatchStock.stage == WatchStage.STRIKE, 0),
                (WatchStock.stage == WatchStage.CONVICTION, 1),
                else_=2,
            ),
            WatchStock.updated_at.desc(),
        )
    )).scalars().all()
    positions = (await db.execute(
        select(Asset).where(
            Asset.user_id == user.id,
            Asset.zone == AssetZone.ACTIVE,
            Asset.category.in_([AssetCategory.STOCK, AssetCategory.ETF, AssetCategory.CRYPTO]),
            Asset.archived.is_(False),
            Asset.is_cash.is_(False),
            Asset.quantity > 0,
        )
    )).scalars().all()
    position_map = {_normalized_asset_symbol(asset.symbol): asset for asset in positions}
    snapshots = [
        {
            "stock": _watch_stock_snapshot(stock),
            "position": _position_snapshot(position_map.get(_normalized_asset_symbol(stock.symbol))),
        }
        for stock in stocks
    ]
    cached = intraday_preview_cache.get(user.id)
    if cached is None or refresh:
        intraday_preview_cache.schedule(
            user.id,
            lambda: _build_intraday_preview_payload(snapshots),
            force=refresh,
        )
    payload = dict(cached) if cached is not None else _empty_intraday_preview_payload(snapshots)
    return {**payload, **intraday_preview_cache.status(user.id)}
