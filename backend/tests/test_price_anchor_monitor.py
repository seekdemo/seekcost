from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base
from app.core import price_anchor_monitor
from app.core.quant_strategies import PRICE_ANCHOR_STRATEGY_KEY
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategySetting
from app.models.user import User
from app.models.watchlist import WatchStock


def _history(last_session: datetime) -> dict:
    start = last_session - timedelta(days=69)
    return {
        "exchange_timezone": "America/New_York",
        "items": [
            {
                "date": int((start + timedelta(days=index)).timestamp()),
                "open": 100,
                "high": 110,
                "low": 90,
                "close": 100,
                "volume": 1_000,
            }
            for index in range(70)
        ],
    }


@pytest.mark.asyncio
async def test_background_monitor_is_private_and_runs_once_per_completed_session(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="anchor-owner", hashed_password="x")
        other = User(username="anchor-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        db.add_all([
            WatchStock(user_id=owner.id, symbol="AAA", name="Alpha", strike_price=95),
            WatchStock(user_id=owner.id, symbol="BBB", name="Beta", fair_price=100),
            WatchStock(user_id=other.id, symbol="PRIVATE", name="Other user"),
        ])
        await db.commit()

        calls: list[str] = []
        latest_session = {"value": datetime(2026, 8, 21, 21, tzinfo=timezone.utc)}

        def fetch(symbol: str, _market: str, _range: str):
            calls.append(symbol)
            return _history(latest_session["value"])

        monkeypatch.setattr(price_anchor_monitor, "fetch_daily_bars", fetch)
        friday_after_close = datetime(2026, 8, 21, 22, tzinfo=timezone.utc)

        disabled = await price_anchor_monitor.scan_due_price_anchor_stocks(
            db, now=friday_after_close
        )
        assert disabled.scanned == 0
        assert calls == []

        db.add(QuantStrategySetting(
            user_id=owner.id,
            strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
            enabled=True,
        ))
        await db.commit()

        first = await price_anchor_monitor.scan_due_price_anchor_stocks(
            db, now=friday_after_close
        )
        assert first.scanned == 2
        assert first.errors == 0
        assert sorted(calls) == ["AAA", "BBB"]
        assert await db.scalar(select(func.count(QuantSignalSnapshot.id))) == 2
        snapshots = (await db.execute(select(QuantSignalSnapshot))).scalars().all()
        assert {snapshot.user_id for snapshot in snapshots} == {owner.id}

        same_session = await price_anchor_monitor.scan_due_price_anchor_stocks(
            db, now=friday_after_close + timedelta(minutes=30)
        )
        assert same_session.scanned == 0
        assert sorted(calls) == ["AAA", "BBB"]

        latest_session["value"] = datetime(2026, 8, 24, 21, tzinfo=timezone.utc)
        monday_after_close = datetime(2026, 8, 24, 22, tzinfo=timezone.utc)
        next_session = await price_anchor_monitor.scan_due_price_anchor_stocks(
            db, now=monday_after_close
        )
        assert next_session.scanned == 2
        assert await db.scalar(select(func.count(QuantSignalSnapshot.id))) == 4
        assert calls.count("AAA") == 2
        assert calls.count("BBB") == 2
        assert "PRIVATE" not in calls

    await engine.dispose()


@pytest.mark.asyncio
async def test_background_monitor_sanitizes_provider_failure(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        user = User(username="anchor-error", hashed_password="x")
        db.add(user)
        await db.flush()
        stock = WatchStock(user_id=user.id, symbol="FAIL", name="Failure")
        db.add(stock)
        db.add(QuantStrategySetting(
            user_id=user.id,
            strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
            enabled=True,
        ))
        await db.commit()

        def fail(*_args):
            raise RuntimeError("secret provider URL and credential")

        monkeypatch.setattr(price_anchor_monitor, "fetch_daily_bars", fail)
        report = await price_anchor_monitor.scan_due_price_anchor_stocks(
            db,
            now=datetime(2026, 8, 21, 22, tzinfo=timezone.utc),
        )

        assert report.scanned == 1
        assert report.errors == 1
        snapshot = await db.scalar(select(QuantSignalSnapshot))
        assert snapshot.signal == "provider_error"
        assert snapshot.reason_codes == ["market_data_unavailable"]
        assert snapshot.metrics == {}
        assert snapshot.error_code == "provider_error"
        assert "secret" not in repr(snapshot.metrics)

    await engine.dispose()
