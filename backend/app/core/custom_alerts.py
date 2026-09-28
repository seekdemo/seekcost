"""SMA entry alerts. No trading, no browser dependency, persistent deduplication."""
import asyncio
import logging
import math
from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from app.core.database import async_session
from app.core.market_history import fetch_daily_bars, infer_watch_market, completed_daily_bars
from app.core.market_quote import get_market_quote
from app.models.custom_alert import AlertRule, AlertNotification, AlertRuleState
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput

logger = logging.getLogger(__name__)
INTERVAL_SECONDS = 300
_task = None


def utc(value):
    return value.replace(tzinfo=timezone.utc) if value and value.tzinfo is None else value


def evaluate(rule, history: dict, quote: dict, now: datetime) -> tuple[str, dict | None, bool | None]:
    if quote.get("status") != "available":
        return "provider_error", None, None
    timestamp, price = quote.get("as_of"), quote.get("price")
    if not timestamp or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
        return "invalid_data", None, None
    age = now.timestamp() - timestamp
    if age < -60 or age > 1200:
        return "stale", None, None
    start, end = quote.get("session_start"), quote.get("session_end")
    if not all(isinstance(v, (int, float)) and math.isfinite(v) for v in (start, end)) or end <= start:
        return "invalid_data", None, None
    if not start <= now.timestamp() < end:
        return "market_closed", None, None
    try:
        tz_name = history.get("exchange_timezone") or ""
        tz = ZoneInfo(tz_name)
        bars = [DailyBarInput(**bar) for bar in history.get("items", [])]
        dates = [datetime.fromtimestamp(bar.date, tz).date() if isinstance(bar.date, int)
                 else datetime.fromisoformat(bar.date).date() for bar in bars]
        if not dates or dates != sorted(set(dates)):
            return "invalid_data", None, None
        # The daily provider must already cover the quote's exchange-local session.
        if dates[-1] != datetime.fromtimestamp(timestamp, tz).date():
            return "stale", None, None
        complete = completed_daily_bars(bars, tz_name, now=now)
        if len(complete) < rule.period:
            return "insufficient_data", None, None
        selected = complete[-rule.period:]
        if any(any(not math.isfinite(v) or v <= 0 for v in (bar.open, bar.high, bar.low, bar.close))
               or bar.high < max(bar.open, bar.close) or bar.low > min(bar.open, bar.close) for bar in selected):
            return "invalid_data", None, None
        closes = [bar.close for bar in selected]
        if any(not math.isfinite(value) or value <= 0 for value in closes):
            return "invalid_data", None, None
        sma = sum(closes) / len(closes)
        gap = (price / sma - 1) * 100
        inside = abs(gap) <= rule.tolerance + 1e-9
        if rule.side == "above":
            inside = inside and gap >= -1e-9
        elif rule.side == "below":
            inside = inside and gap <= 1e-9
        through = complete[-1].date
        through_date = datetime.fromtimestamp(through, tz).date().isoformat() if isinstance(through, int) else through
        evidence = {"price": price, "sma": sma, "gap_pct": gap, "period": rule.period,
                    "tolerance": rule.tolerance, "side": rule.side, "quote_at": timestamp,
                    "sma_through": through_date, "currency": quote.get("currency", ""),
                    "source": "Yahoo Finance", "cooldown_minutes": rule.cooldown_minutes}
        return "inside" if inside else "outside", evidence, inside
    except (ValueError, TypeError, KeyError, OverflowError):
        return "invalid_data", None, None


def should_notify(rule, inside, now, state=None):
    state = state if state is not None else rule
    if inside is not True or state.inside is True:
        return False
    return not state.last_triggered_at or (now - utc(state.last_triggered_at)).total_seconds() >= rule.cooldown_minutes * 60


async def apply_observation(db, rule, symbol, history, quote, now, state=None):
    status, evidence, inside = evaluate(rule, history, quote, now)
    notify = should_notify(rule, inside, now, state)
    changes = {"status": status, "checked_at": now, "version": (state.version if state else rule.version) + 1}
    if inside is not None:
        changes.update(inside=inside, evidence=evidence)
    if notify:
        changes["last_triggered_at"] = now
    # Edits, disabling, concurrent workers and prior scans invalidate this claim.
    if state is not None:
        current_parent = select(AlertRule.id).where(AlertRule.id == rule.id, AlertRule.version == rule.version,
                                                    AlertRule.enabled.is_(True), AlertRule.scope == "watchlist").exists()
        statement = update(AlertRuleState).where(AlertRuleState.id == state.id, AlertRuleState.rule_id == rule.id,
                                                 AlertRuleState.version == state.version, current_parent)
    else:
        statement = update(AlertRule).where(AlertRule.id == rule.id, AlertRule.version == rule.version,
                                            AlertRule.enabled.is_(True), AlertRule.scope == "single")
    claim = await db.execute(statement.values(**changes).execution_options(synchronize_session=False))
    if claim.rowcount != 1:
        await db.rollback()
        return False
    if notify:
        db.add(AlertNotification(user_id=rule.user_id, rule_id=rule.id, stock_id=state.stock_id if state else rule.stock_id,
                                rule_name=rule.name, symbol=symbol, evidence=evidence, created_at=now))
    await db.commit()
    return notify


async def scan_once(session_factory=async_session):
    async with session_factory() as db:
        rules = list((await db.scalars(select(AlertRule).where(AlertRule.enabled.is_(True)))).all())
        stocks = list((await db.scalars(select(WatchStock).where(WatchStock.user_id.in_({r.user_id for r in rules})))).all())
        groups = {}
        for rule in rules:
            targets = [stock for stock in stocks if stock.user_id == rule.user_id and (rule.scope == "watchlist" or stock.id == rule.stock_id)]
            states = {state.stock_id: state for state in (await db.scalars(select(AlertRuleState).where(AlertRuleState.rule_id == rule.id))).all()} if rule.scope == "watchlist" else {}
            for stock in targets:
                state = states.get(stock.id)
                if rule.scope == "watchlist" and state is None:
                    try:
                        async with db.begin_nested():
                            state = AlertRuleState(rule_id=rule.id, stock_id=stock.id)
                            db.add(state)
                            await db.flush()
                    except IntegrityError:
                        state = await db.scalar(select(AlertRuleState).where(AlertRuleState.rule_id == rule.id, AlertRuleState.stock_id == stock.id))
                        if state is None:
                            continue
                job = (rule.id, rule.version, stock.id, state.id if state else None, state.version if state else None)
                groups.setdefault((stock.symbol, infer_watch_market(stock.symbol, stock.sector)), []).append(job)
        await db.commit()
    semaphore = asyncio.Semaphore(4)
    async def scan_group(key, ids):
        async with semaphore:
            try:
                history, quote = await asyncio.gather(asyncio.to_thread(fetch_daily_bars, *key, "2y"), get_market_quote(*key))
            except Exception:
                history, quote = {}, {"status": "unavailable"}
            for rule_id, version, stock_id, state_id, state_version in ids:
                try:
                    async with session_factory() as db:
                        rule = await db.get(AlertRule, rule_id)
                        if rule and rule.enabled and rule.version == version:
                            stock = await db.get(WatchStock, stock_id)
                            if stock and stock.user_id == rule.user_id and (stock.symbol, infer_watch_market(stock.symbol, stock.sector)) == key:
                                state = await db.get(AlertRuleState, state_id) if state_id else None
                                if state_id and (state is None or state.version != state_version):
                                    continue
                                await apply_observation(db, rule, key[0], history, quote, datetime.now(timezone.utc), state)
                except Exception:
                    logger.exception("Custom alert evaluation failed for rule %s", rule_id)
    await asyncio.gather(*(scan_group(key, ids) for key, ids in groups.items()))


async def _loop():
    await asyncio.sleep(10)
    while True:
        try:
            await scan_once()
        except Exception:
            logger.exception("Custom alert scan failed")
        await asyncio.sleep(INTERVAL_SECONDS)


def start():
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())


def stop():
    if _task and not _task.done():
        _task.cancel()
