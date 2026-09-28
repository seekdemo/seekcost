"""Explicit, preview-first replacement of fictional demo watchlists from Futu CSVs."""
import argparse
import asyncio
import csv
import json
import re
from collections import Counter
from pathlib import Path

from sqlalchemy import delete, select
from app.core.database import async_session
from app.models import (User, SiteAdmin, ResearchGuide, WatchStock, StockMemo,
                        EarningsEvent, WatchStockResearchSection, Note, ResearchLink,
                        AlertRule, AlertRuleState, AlertNotification,
                        QuantSignalSnapshot, QuantStrategyQualification)
from app.models.sell_batch_item import SellBatchItem  # noqa: F401
from app.models.watchlist import WatchStage

MARKER = "Demo watchlist imported from user-provided Futu CSV"


def parse_sources(paths):
    items = {}
    for source in paths:
        path = Path(source)
        theme = re.match(r"futu_groups_7_csv_\d+\.\s*(.+)$", path.stem)
        count = 0
        with path.open(encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            if not {"代码", "名称", "市场"}.issubset(reader.fieldnames or []):
                raise ValueError(f"Invalid watchlist columns: {path.name}")
            for row in reader:
                symbol = (row.get("代码") or "").strip().upper().removesuffix(".US")
                name = (row.get("名称") or "").strip()
                market = (row.get("市场") or "").strip()
                if not re.fullmatch(r"[A-Z0-9.^-]{1,32}", symbol) or not name or len(name) > 128:
                    raise ValueError(f"Invalid stock in {path.name}, line {reader.line_num}")
                if market not in {"美股", "上海", "深圳", "港股", "北京", "A股"}:
                    raise ValueError(f"Unknown market: {market}")
                sector = f"A股 · {market}" if market in {"上海", "深圳", "北京"} else market
                item = items.setdefault(symbol, dict(symbol=symbol, industries=[], concepts=[]))
                item.update(name=name, sector=sector)
                category = (row.get("分类") or "").strip()
                if category and category not in item["industries"]:
                    item["industries"].append(category)
                if theme and theme[1] not in item["concepts"]:
                    item["concepts"].append(theme[1])
                count += 1
        if not count:
            raise ValueError(f"Empty watchlist: {path.name}")
    if not items:
        raise ValueError("No sources supplied")
    return items


async def replace_demo_watchlist(db, items, apply=False):
    if not items:
        raise ValueError("Empty replacement refused")
    async with db.begin():
        user = await db.scalar(select(User).where(User.username == "demo"))
        if user is None or await db.get(SiteAdmin, user.id):
            raise ValueError("An existing ordinary demo account is required")
        stocks = list(await db.scalars(select(WatchStock).where(WatchStock.user_id == user.id)))
        ids = [s.id for s in stocks]
        if await db.scalar(select(ResearchGuide.id).where(ResearchGuide.stock_id.in_(ids))):
            raise ValueError("Protected research drafts exist; no changes made")
        existing = {s.symbol: s for s in stocks}
        removed = [s.id for s in stocks if s.symbol not in items]
        for stock in stocks:
            if not stock.name.startswith("【演示】") and stock.notes != MARKER:
                raise ValueError(f"Protected non-fixture stock: {stock.symbol}")
            if stock.notes == MARKER and (stock.business_summary or stock.thesis or stock.invalidation
                    or stock.entry_reason or stock.growth_drivers or stock.fundamental_risks
                    or stock.fundamental_metrics or stock.milestones or stock.fair_price
                    or stock.strike_price or stock.target_price or stock.planned_capital
                    or stock.stage != WatchStage.RADAR):
                raise ValueError(f"Protected edited stock: {stock.symbol}")
        cleanup = []
        for model, field in [(StockMemo, "content"), (WatchStockResearchSection, "summary"), (EarningsEvent, "note")]:
            rows = list(await db.scalars(select(model).where(model.stock_id.in_(ids))))
            def empty_section(r):
                return isinstance(r, WatchStockResearchSection) and not any((
                    r.summary, r.evidence, r.open_questions, r.review_note,
                    r.reviewed_at, r.next_review_at))
            if any(r.user_id != user.id or not (getattr(r, field).startswith("【演示】") or empty_section(r)) for r in rows):
                raise ValueError("Protected non-fixture research or calendar content exists")
            cleanup.extend(rows)
        links = list(await db.scalars(select(ResearchLink).where(
            ResearchLink.entity_type == "watch_stock", ResearchLink.entity_id.in_(ids))))
        notes = []
        for link in links:
            note = await db.get(Note, link.note_id)
            if link.user_id != user.id or note.user_id != user.id or not note.title.startswith("【演示】"):
                raise ValueError("Protected linked research exists")
            notes.append(note)
        if await db.scalar(select(AlertRule.id).where(AlertRule.stock_id.in_(removed))):
            raise ValueError("Removed stock has alert rules; inspect manually")
        notifications = list(await db.scalars(select(AlertNotification).where(AlertNotification.user_id == user.id)))
        fictional = [n for n in notifications if n.rule_name.startswith("【演示通知】")]
        report = dict(total=len(items), created=len(set(items) - set(existing)), removed=len(removed),
                      retained=len(set(items) & set(existing)), cleared_examples=len(cleanup),
                      archived_notes=len({n.id for n in notes}), applied=apply,
                      markets=dict(Counter(v["sector"] for v in items.values())),
                      themes=dict(Counter(c for v in items.values() for c in v["concepts"])))
        if not apply:
            return report
        for row in cleanup + fictional:
            await db.delete(row)
        for note in notes:
            note.status = "archived"
        for link in links:
            if link.entity_id in removed:
                await db.delete(link)
        for notification in notifications:
            if notification not in fictional and notification.stock_id in removed:
                notification.stock_id = None
        for model in (AlertRuleState, QuantSignalSnapshot, QuantStrategyQualification):
            await db.execute(delete(model).where(model.stock_id.in_(removed)))
        await db.flush()
        await db.execute(delete(WatchStock).where(WatchStock.id.in_(removed)))
        for symbol, item in items.items():
            stock = existing.get(symbol)
            if stock is not None and stock.notes == MARKER:
                # Refresh source metadata only; never erase fetched quotes on a repeat import.
                for key, value in item.items():
                    setattr(stock, key, value)
                continue
            if stock is None:
                stock = WatchStock(user_id=user.id, symbol=symbol)
                db.add(stock)
            for key, value in item.items():
                setattr(stock, key, value)
            for key in ("inspiration", "entry_reason", "business_summary", "growth_drivers", "fundamental_risks", "thesis", "invalidation", "price_session"):
                setattr(stock, key, "")
            for key in ("current_price", "fair_price", "strike_price", "target_price", "planned_capital", "first_entry_drop"):
                setattr(stock, key, 0)
            stock.price_change = stock.price_change_pct = None
            stock.fundamental_metrics = []
            stock.milestones = []
            stock.stage = WatchStage.RADAR
            stock.notes = MARKER
        return report


async def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("sources", nargs="+", type=Path)
    parser.add_argument("--apply", action="store_true", help="Apply after creating a database backup")
    args = parser.parse_args()
    items = parse_sources(args.sources)
    async with async_session() as db:
        print(json.dumps(await replace_demo_watchlist(db, items, args.apply), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
