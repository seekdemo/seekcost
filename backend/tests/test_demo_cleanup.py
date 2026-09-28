from datetime import date

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.demo_cleanup import clear_user_data, preview_user_cleanup
from app.models.asset import Asset, AssetCategory, AssetMarket, AssetZone
from app.models.note import Note, NoteComment, NoteCommentReaction, NoteFormat, NoteSeries
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategyQualification, QuantStrategySetting
from app.models.sell_batch_item import SellBatchItem  # noqa: F401 - register relationship target
from app.models.user import User
from app.models.watchlist import EarningsEvent, WatchStock
from app.models.watchlist_research import WatchResearchSectionKey, WatchStockResearchSection


async def _session() -> tuple[async_sessionmaker[AsyncSession], object]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False), engine


async def _seed(db: AsyncSession) -> None:
    user = User(username="seekdemo", hashed_password="hash")
    other = User(username="keepme", hashed_password="hash")
    db.add_all([user, other])
    await db.flush()
    note = Note(user_id=user.id, title="Demo research", content="# Demo", format=NoteFormat.MARKDOWN)
    series = NoteSeries(user_id=user.id, name="Demo series")
    stock = WatchStock(user_id=user.id, symbol="DEMO", name="Demo company")
    asset = Asset(user_id=user.id, symbol="DEMO", name="Demo asset", zone=AssetZone.ACTIVE, category=AssetCategory.STOCK, market=AssetMarket.US)
    db.add_all([note, series, stock, asset])
    await db.flush()
    comment = NoteComment(note_id=note.id, user_id=user.id, content="Demo comment")
    db.add(comment)
    await db.flush()
    db.add(NoteCommentReaction(user_id=user.id, comment_id=comment.id, emoji="👍"))
    db.add(WatchStockResearchSection(user_id=user.id, stock_id=stock.id, key=WatchResearchSectionKey.COMPANY_OVERVIEW, summary="demo"))
    db.add(EarningsEvent(user_id=user.id, stock_id=stock.id, event_date=date(2026, 9, 1)))
    db.add(QuantStrategySetting(user_id=user.id, strategy_key="chang-five-day-line", enabled=True))
    db.add(QuantStrategyQualification(
        user_id=user.id,
        strategy_key="chang-five-day-line",
        stock_id=stock.id,
        historical_low=True,
        valuation_low=True,
        attention_low=True,
    ))
    db.add(QuantSignalSnapshot(
        user_id=user.id,
        strategy_key="chang-five-day-line",
        stock_id=stock.id,
        signal="watch",
        reason_codes=["seed"],
        metrics={},
        strategy_version="1.0.0",
        source="test",
    ))
    await db.commit()


@pytest.mark.asyncio
async def test_preview_does_not_mutate_and_reports_owned_rows():
    sessions, engine = await _session()
    async with sessions() as db:
        await _seed(db)
        report = await preview_user_cleanup(db, "seekdemo")
        assert report.user_id is not None
        assert report.deleted["notes"] == 1
        assert report.deleted["note_comments"] == 1
        assert report.deleted["watch_stocks"] == 1
        assert report.deleted["quant_signal_snapshots"] == 1
        assert report.deleted["quant_strategy_qualifications"] == 1
        assert report.deleted["quant_strategy_settings"] == 1
        assert report.total_deleted >= 8
        assert (await db.execute(select(User).where(User.username == "seekdemo"))).scalar_one_or_none() is not None
    await engine.dispose()


@pytest.mark.asyncio
async def test_clear_is_idempotent_and_keeps_other_user():
    sessions, engine = await _session()
    async with sessions() as db:
        await _seed(db)
        report = await clear_user_data(db, "seekdemo")
        assert report.deleted["users"] == 1
        assert (await db.execute(select(User).where(User.username == "seekdemo"))).scalar_one_or_none() is None
        assert (await db.execute(select(User).where(User.username == "keepme"))).scalar_one_or_none() is not None
        second = await clear_user_data(db, "seekdemo")
        assert second.user_id is None
        assert second.total_deleted == 0
    await engine.dispose()
