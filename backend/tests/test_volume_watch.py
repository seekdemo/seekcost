"""Decision-page volume watch: prior-session comparison and private snapshots."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core.database import get_db
from app.core import volume_watch
from app.core.price_anchor_monitor import latest_session_cutoff
from app.core.security import get_current_user
from app.main import app
from app.models.quant_strategy import QuantSignalSnapshot
from app.models.user import User
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput


def bar(day: str, volume: float) -> DailyBarInput:
    return DailyBarInput(date=day, open=100, high=101, low=99, close=100, volume=volume)


def test_volume_watch_uses_previous_session_not_three_day_average():
    result = volume_watch.evaluate_daily_volume([bar("2026-09-24", 80), bar("2026-09-25", 100), bar("2026-09-28", 150)])
    assert result == {
        "bar_date": "2026-09-28",
        "latest_volume": 150.0,
        "previous_volume": 100.0,
        "ratio": 1.5,
    }
    assert volume_watch.evaluate_daily_volume([bar("2026-09-28", 150)])["ratio"] is None
    assert volume_watch.evaluate_daily_volume([bar("2026-09-25", 0), bar("2026-09-28", 150)])["ratio"] is None
    assert volume_watch.evaluate_daily_volume([bar("2026-09-25", 100), bar("2026-09-28", 0)])["ratio"] is None


@pytest.mark.asyncio
async def test_volume_watch_excludes_partial_session_and_uses_local_close(monkeypatch):
    stock = WatchStock(user_id=1, symbol="600000.SH", name="CN")
    monkeypatch.setattr(volume_watch, "fetch_daily_bars", lambda *_: {
        "exchange_timezone": "Asia/Shanghai",
        "items": [bar("2026-09-28", 100).model_dump(), bar("2026-09-29", 150).model_dump()],
    })
    before = await volume_watch._evaluate(stock, "cn", datetime(2026, 9, 29, 6, tzinfo=timezone.utc))
    assert before.metrics["bar_date"] == "2026-09-28"
    assert before.metrics["ratio"] is None
    after = await volume_watch._evaluate(stock, "cn", datetime(2026, 9, 29, 8, tzinfo=timezone.utc))
    assert after.metrics["bar_date"] == "2026-09-29"
    assert after.metrics["ratio"] == 1.5


@pytest.mark.asyncio
async def test_volume_watch_retries_when_provider_has_not_published_latest_bar(monkeypatch):
    stock = WatchStock(user_id=1, symbol="AAA", name="Alpha")
    monkeypatch.setattr(volume_watch, "fetch_daily_bars", lambda *_: {
        "exchange_timezone": "America/New_York",
        "items": [bar("2026-09-25", 100).model_dump(), bar("2026-09-28", 150).model_dump()],
    })
    result = await volume_watch._evaluate(stock, "us", datetime(2026, 9, 29, 22, tzinfo=timezone.utc))
    assert result.provider_error is True
    assert result.metrics == {}


@pytest.mark.asyncio
async def test_volume_scan_is_private_and_once_per_completed_session(monkeypatch):
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="volume-owner", hashed_password="x")
        other = User(username="volume-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        db.add_all([
            WatchStock(user_id=owner.id, symbol="AAA", name="Alpha"),
            WatchStock(user_id=other.id, symbol="BBB", name="Beta"),
        ])
        await db.commit()

        calls: list[str] = []
        latest = {"date": "2026-09-28"}

        def fetch(symbol: str, market: str, range_key: str):
            calls.append(symbol)
            assert market == "us"
            assert range_key == "1mo"
            return {"exchange_timezone": "America/New_York", "items": [
                {"date": "2026-09-25", "open": 100, "high": 101, "low": 99, "close": 100, "volume": 100},
                {"date": latest["date"], "open": 100, "high": 101, "low": 99, "close": 100, "volume": 150},
            ]}

        monkeypatch.setattr(volume_watch, "fetch_daily_bars", fetch)
        monday_close = datetime(2026, 9, 28, 22, tzinfo=timezone.utc)
        report = await volume_watch.scan_due_volume_watch_stocks(db, now=monday_close)
        assert report.scanned == 2
        assert sorted(calls) == ["AAA", "BBB"]
        snapshots = (await db.execute(select(QuantSignalSnapshot))).scalars().all()
        assert len(snapshots) == 2
        assert {row.user_id for row in snapshots} == {owner.id, other.id}
        assert all(row.metrics["ratio"] == 1.5 for row in snapshots)

        again = await volume_watch.scan_due_volume_watch_stocks(db, now=monday_close + timedelta(minutes=30))
        assert again.scanned == 0
        assert len(calls) == 2

        latest["date"] = "2026-09-29"
        next_close = datetime(2026, 9, 29, 22, tzinfo=timezone.utc)
        next_report = await volume_watch.scan_due_volume_watch_stocks(db, now=next_close)
        assert next_report.scanned == 2
        assert await db.scalar(select(func.count(QuantSignalSnapshot.id))) == 4
    await engine.dispose()


@pytest.mark.asyncio
async def test_volume_watch_overview_threshold_validation_and_user_isolation():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    now = datetime.now(timezone.utc)
    cutoff = latest_session_cutoff(now, "us")
    bar_date = cutoff.astimezone(ZoneInfo("America/New_York")).date().isoformat()
    async with sessions() as db:
        owner = User(username="volume-api-owner", hashed_password="x")
        other = User(username="volume-api-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        own_stock = WatchStock(user_id=owner.id, symbol="OWN", name="Own")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER", name="Other")
        db.add_all([own_stock, other_stock])
        await db.flush()
        for stock in [own_stock, other_stock]:
            db.add(QuantSignalSnapshot(
                user_id=stock.user_id, stock_id=stock.id,
                strategy_key=volume_watch.VOLUME_WATCH_STRATEGY_KEY,
                strategy_version="1.0", signal="volume_observation", reason_codes=[],
                metrics={"ratio": 1.7, "latest_volume": 170, "previous_volume": 100},
                bar_date=bar_date, source="test", execution_timing="post_close",
                evaluated_at=now,
            ))
        await db.commit()

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return owner

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            overview = (await client.get("/api/v1/workbench/overview")).json()["volume_watch"]
            assert overview["threshold"] == 1.5
            assert overview["scanned_count"] == 1
            assert [item["symbol"] for item in overview["items"]] == ["OWN"]
            assert (await client.patch("/api/v1/workbench/volume-watch", json={"threshold": 0.9})).status_code == 422
            assert (await client.patch("/api/v1/workbench/volume-watch", json={"threshold": 1.8})).status_code == 200
            updated = (await client.get("/api/v1/workbench/overview")).json()["volume_watch"]
            assert updated["threshold"] == 1.8
            assert updated["items"] == []
            assert (await client.patch("/api/v1/workbench/volume-watch", json={"threshold": 1.6})).status_code == 200
            restored = (await client.get("/api/v1/workbench/overview")).json()["volume_watch"]
            assert [item["symbol"] for item in restored["items"]] == ["OWN"]
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_volume_overview_hides_stale_and_invalid_snapshots():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    now = datetime.now(timezone.utc)
    cutoff = latest_session_cutoff(now, "us")
    bar_date = cutoff.astimezone(ZoneInfo("America/New_York")).date().isoformat()
    async with sessions() as db:
        user = User(username="volume-stale", hashed_password="x")
        db.add(user)
        await db.flush()
        stocks = [WatchStock(user_id=user.id, symbol=symbol, name=symbol) for symbol in ["STALE", "ZERO", "ERROR"]]
        db.add_all(stocks)
        await db.flush()
        for stock, evaluated_at, metrics, error_code in [
            (stocks[0], cutoff - timedelta(days=1), {"ratio": 2.0}, None),
            (stocks[1], now, {"ratio": None, "latest_volume": 100, "previous_volume": 0}, None),
            (stocks[2], now, {}, "provider_error"),
        ]:
            db.add(QuantSignalSnapshot(
                user_id=user.id, stock_id=stock.id,
                strategy_key=volume_watch.VOLUME_WATCH_STRATEGY_KEY,
                strategy_version="1.0", signal="volume_observation", reason_codes=[],
                metrics=metrics, bar_date=bar_date, source="test", execution_timing="post_close",
                evaluated_at=evaluated_at, error_code=error_code,
            ))
        await db.commit()
        result = await volume_watch.volume_watch_overview(db, user.id, stocks, now)
        assert result["items"] == []
        assert result["scanned_count"] == 1
        assert result["total_count"] == 3
    await engine.dispose()
