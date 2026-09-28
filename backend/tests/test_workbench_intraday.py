import asyncio
import threading
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.intraday_preview_cache import IntradayPreviewCache
from app.core.process_capacity_limiter import ProcessCapacityLimiter
from app.core.security import get_current_user
from app.main import app
from app.models.quant_strategy import QuantSignalSnapshot
from app.models.user import User
from app.models.watchlist import WatchStock
import app.api.v1.workbench as workbench_api


def _ts(day: int, minute: int = 5) -> int:
    return int(datetime(2026, 8, day, 10, minute, tzinfo=ZoneInfo("America/New_York")).timestamp())


@pytest.mark.asyncio
async def test_intraday_preview_is_user_scoped_and_does_not_persist(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with sessions() as db:
        owner = User(username="intraday-owner", hashed_password="x")
        other = User(username="intraday-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        owned = WatchStock(user_id=owner.id, symbol="OWN1", name="Owner one", current_price=99, strike_price=100)
        foreign = WatchStock(user_id=other.id, symbol="OTHER", name="Other", current_price=99)
        db.add_all([owned, foreign])
        await db.commit()

    monkeypatch.setattr(workbench_api, "fetch_intraday_bars", lambda *_args: {
        "items": [
            {"timestamp": _ts(18, 0), "close": 100, "volume": 100},
            {"timestamp": _ts(18, 5), "close": 99.5, "volume": 100},
            {"timestamp": _ts(19, 0), "close": 100, "volume": 100},
            {"timestamp": _ts(19, 5), "close": 100, "volume": 100},
            {"timestamp": _ts(20, 0), "close": 100, "volume": 100},
            {"timestamp": _ts(20, 5), "close": 100, "volume": 100},
        ],
        "exchange_timezone": "America/New_York",
    })
    monkeypatch.setattr(workbench_api, "fetch_daily_bars", lambda *_args: {
        "items": [{"date": str(day), "close": 100} for day in range(1, 6)],
    })
    monkeypatch.setattr(workbench_api, "get_market_session", lambda *_args: "regular")

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return owner

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    cache = IntradayPreviewCache()
    monkeypatch.setattr(workbench_api, "intraday_preview_cache", cache)
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/workbench/intraday-preview")
        assert response.status_code == 200
        payload = response.json()
        assert payload["refreshing"] is True
        assert payload["total_count"] == 1
        assert payload["items"] == []
        await cache.wait(owner.id)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/api/v1/workbench/intraday-preview")
        payload = response.json()
        assert {item["symbol"] for item in payload["items"]} == {"OWN1"}
        assert all(item["is_provisional"] is True for item in payload["items"])
        async with sessions() as db:
            assert (await db.execute(select(QuantSignalSnapshot))).scalars().all() == []
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_intraday_cache_returns_old_value_while_one_refresh_runs():
    gate = asyncio.Event()
    cache = IntradayPreviewCache(ttl_seconds=300)
    cache.store(7, {"items": [{"stock_id": 1}]})

    async def refresh():
        await gate.wait()
        return {"items": [{"stock_id": 2}]}

    assert cache.schedule(7, refresh, force=True) is True
    assert cache.schedule(7, refresh, force=True) is False
    assert cache.get(7)["items"][0]["stock_id"] == 1
    assert cache.status(7)["refreshing"] is True
    gate.set()
    await cache.wait(7)
    assert cache.get(7)["items"][0]["stock_id"] == 2
    assert cache.status(7)["refreshing"] is False


@pytest.mark.asyncio
async def test_intraday_preview_worker_limits_stock_concurrency(monkeypatch):
    active = 0
    peak = 0

    async def preview_item(stock, _position):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        await asyncio.sleep(0.01)
        active -= 1
        return {"stock_id": stock["id"], "error_code": None}

    snapshots = [
        {
            "stock": {
                "id": stock_id,
                "symbol": f"TEST{stock_id}",
                "name": f"Test {stock_id}",
                "sector": "",
                "current_price": None,
            },
            "position": None,
        }
        for stock_id in range(7)
    ]
    monkeypatch.setattr(workbench_api, "_intraday_preview_item", preview_item)

    result = await workbench_api._build_intraday_preview_payload(snapshots)

    assert len(result["items"]) == 7
    assert peak == 6


@pytest.mark.asyncio
async def test_intraday_preview_workers_share_process_wide_stock_concurrency(monkeypatch):
    active = 0
    peak = 0
    initial_slots_started = asyncio.Event()
    release = asyncio.Event()

    async def preview_item(stock, _position):
        nonlocal active, peak
        active += 1
        peak = max(peak, active)
        if active == 6:
            initial_slots_started.set()
        await release.wait()
        active -= 1
        return {"stock_id": stock["id"], "error_code": None}

    def snapshots(offset):
        return [
            {
                "stock": {
                    "id": offset + stock_id,
                    "symbol": f"TEST{offset + stock_id}",
                    "name": f"Test {offset + stock_id}",
                    "sector": "",
                    "current_price": None,
                },
                "position": None,
            }
            for stock_id in range(7)
        ]

    monkeypatch.setattr(workbench_api, "_intraday_preview_item", preview_item)
    workers = [
        asyncio.create_task(workbench_api._build_intraday_preview_payload(snapshots(0))),
        asyncio.create_task(workbench_api._build_intraday_preview_payload(snapshots(100))),
    ]
    try:
        await asyncio.wait_for(initial_slots_started.wait(), timeout=1)
        await asyncio.sleep(0.05)
        assert active == peak == 6
    finally:
        release.set()
        await asyncio.gather(*workers)


@pytest.mark.asyncio
async def test_intraday_preview_global_provider_cap_holds_fast_failures_until_slow_siblings_settle(monkeypatch):
    active_provider_calls = 0
    peak_provider_calls = 0
    provider_call_count = 0
    provider_lock = threading.Lock()
    initial_twelve_started = asyncio.Event()
    loop = asyncio.get_running_loop()
    release_fast_failures = threading.Event()
    release_slow_siblings = threading.Event()

    def provider_started() -> None:
        nonlocal active_provider_calls, peak_provider_calls, provider_call_count
        with provider_lock:
            active_provider_calls += 1
            provider_call_count += 1
            peak_provider_calls = max(peak_provider_calls, active_provider_calls)
            if provider_call_count == 12:
                loop.call_soon_threadsafe(initial_twelve_started.set)

    def provider_finished() -> None:
        nonlocal active_provider_calls
        with provider_lock:
            active_provider_calls -= 1

    def fetch_intraday(symbol, *_args):
        provider_started()
        release_fast_failures.wait(timeout=2)
        provider_finished()
        raise RuntimeError(f"fast intraday failure for {symbol}")

    def fetch_daily(*_args):
        provider_started()
        release_slow_siblings.wait(timeout=2)
        provider_finished()
        return {"items": []}

    def snapshots(offset):
        return [
            {
                "stock": {
                    "id": offset + stock_id,
                    "symbol": f"FAIL{offset + stock_id}",
                    "name": f"Test {offset + stock_id}",
                    "sector": "",
                    "current_price": None,
                    "strike_price": None,
                    "fair_price": None,
                    "target_price": None,
                },
                "position": None,
            }
            for stock_id in range(7)
        ]

    monkeypatch.setattr(workbench_api, "_intraday_preview_capacity", ProcessCapacityLimiter(6))
    monkeypatch.setattr(workbench_api, "fetch_intraday_bars", fetch_intraday)
    monkeypatch.setattr(workbench_api, "fetch_daily_bars", fetch_daily)
    monkeypatch.setattr(workbench_api, "get_market_session", lambda *_args: "regular")
    workers = [
        asyncio.create_task(workbench_api._build_intraday_preview_payload(snapshots(0))),
        asyncio.create_task(workbench_api._build_intraday_preview_payload(snapshots(100))),
    ]
    try:
        await asyncio.wait_for(initial_twelve_started.wait(), timeout=1)
        assert peak_provider_calls == active_provider_calls == provider_call_count == 12

        release_fast_failures.set()
        await asyncio.sleep(0.05)
        assert provider_call_count == 12
        assert peak_provider_calls == 12
    finally:
        release_fast_failures.set()
        release_slow_siblings.set()
        await asyncio.gather(*workers)


@pytest.mark.asyncio
async def test_intraday_preview_keeps_stock_slot_until_failed_provider_sibling_settles(monkeypatch):
    release_providers = threading.Event()
    daily_started = set()
    provider_symbols = set()
    started_lock = threading.Lock()
    initial_slots_started = asyncio.Event()
    loop = asyncio.get_running_loop()

    def fetch_intraday(symbol, *_args):
        with started_lock:
            provider_symbols.add(symbol)
        if symbol == "FAIL":
            raise RuntimeError("intraday provider failed")
        release_providers.wait(timeout=2)
        return {"items": [], "exchange_timezone": "America/New_York"}

    def fetch_daily(symbol, *_args):
        with started_lock:
            provider_symbols.add(symbol)
            daily_started.add(symbol)
            if len(daily_started) >= 6:
                loop.call_soon_threadsafe(initial_slots_started.set)
        release_providers.wait(timeout=2)
        return {"items": []}

    snapshots = [
        {
            "stock": {
                "id": stock_id,
                "symbol": "FAIL" if stock_id == 0 else f"BLOCK{stock_id}",
                "name": f"Test {stock_id}",
                "sector": "",
                "current_price": None,
                "strike_price": None,
                "fair_price": None,
                "target_price": None,
            },
            "position": None,
        }
        for stock_id in range(7)
    ]
    monkeypatch.setattr(workbench_api, "fetch_intraday_bars", fetch_intraday)
    monkeypatch.setattr(workbench_api, "fetch_daily_bars", fetch_daily)
    monkeypatch.setattr(workbench_api, "get_market_session", lambda *_args: "regular")

    worker = asyncio.create_task(workbench_api._build_intraday_preview_payload(snapshots))
    try:
        await asyncio.wait_for(initial_slots_started.wait(), timeout=1)
        await asyncio.sleep(0.05)
        assert "BLOCK6" not in provider_symbols
    finally:
        release_providers.set()
        await worker


@pytest.mark.asyncio
async def test_intraday_cache_retries_automatic_cold_refresh_after_failure():
    cache = IntradayPreviewCache(ttl_seconds=300)

    async def fail():
        raise RuntimeError("Yahoo timed out")

    async def recover():
        return {"items": [{"stock_id": 8}]}

    assert cache.schedule(8, fail) is True
    await cache.wait(8)
    assert cache.get(8) is None
    assert cache.status(8)["refresh_error"] == "Yahoo timed out"

    assert cache.schedule(8, recover, force=True) is False
    assert cache.schedule(8, recover) is True
    await cache.wait(8)
    assert cache.get(8) == {"items": [{"stock_id": 8}]}


def test_intraday_cache_evicts_only_inactive_entries_after_retention(monkeypatch):
    now = datetime(2026, 8, 30, 12, tzinfo=timezone.utc)
    cache = IntradayPreviewCache(ttl_seconds=300, retention_seconds=600, max_entries=10)
    monkeypatch.setattr(cache, "_now", lambda: now)

    cache.store(1, {"items": [{"stock_id": 1}]})
    now += timedelta(seconds=599)
    cache.store(2, {"items": [{"stock_id": 2}]})
    assert 1 in cache._entries

    now += timedelta(seconds=2)
    cache.store(3, {"items": [{"stock_id": 3}]})
    assert 1 not in cache._entries
    assert set(cache._entries) == {2, 3}


@pytest.mark.asyncio
async def test_intraday_cache_capacity_never_evicts_active_or_five_minute_entries(monkeypatch):
    now = datetime(2026, 8, 30, 12, tzinfo=timezone.utc)
    cache = IntradayPreviewCache(ttl_seconds=300, retention_seconds=600, max_entries=1)
    monkeypatch.setattr(cache, "_now", lambda: now)
    cache.store(1, {"items": [{"stock_id": 1}]})

    release = asyncio.Event()

    async def refresh():
        await release.wait()
        return {"items": [{"stock_id": 10}]}

    now += timedelta(seconds=301)
    assert cache.schedule(1, refresh, force=True) is True
    cache.store(2, {"items": [{"stock_id": 2}]})
    assert set(cache._entries) == {1, 2}
    assert cache.status(1)["refreshing"] is True

    release.set()
    await cache.wait(1)
    now += timedelta(seconds=301)
    cache.store(3, {"items": [{"stock_id": 3}]})
    assert len(cache._entries) == 1
    assert 3 in cache._entries


@pytest.mark.asyncio
async def test_intraday_endpoint_single_flight_cooldown_and_failure_preservation(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="intraday-background-owner", hashed_password="x")
        db.add(owner)
        await db.flush()
        db.add(WatchStock(user_id=owner.id, symbol="OWN1", name="Owner one", current_price=99))
        await db.commit()

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return owner

    gate = asyncio.Event()
    calls = 0

    async def blocked_refresh(_stocks):
        nonlocal calls
        calls += 1
        await gate.wait()
        return {
            "generated_at": "2026-08-30T12:00:00+00:00",
            "is_market_open": True,
            "items": [{"stock_id": 1, "symbol": "OWN1"}],
            "provider_errors": 0,
            "requested_count": 1,
            "total_count": 1,
        }

    cache = IntradayPreviewCache()
    monkeypatch.setattr(workbench_api, "intraday_preview_cache", cache)
    monkeypatch.setattr(workbench_api, "_build_intraday_preview_payload", blocked_refresh)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            first = await client.get("/api/v1/workbench/intraday-preview")
            second = await client.get("/api/v1/workbench/intraday-preview")
        assert first.status_code == second.status_code == 200
        assert first.json()["items"] == second.json()["items"] == []
        assert second.json()["refreshing"] is True
        await asyncio.sleep(0)
        assert calls == 1

        gate.set()
        await cache.wait(owner.id)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            cached = await client.get("/api/v1/workbench/intraday-preview")
            manual = await client.get("/api/v1/workbench/intraday-preview?refresh=true")
        assert cached.json()["items"] == [{"stock_id": 1, "symbol": "OWN1"}]
        assert manual.json()["refreshing"] is False
        assert calls == 1

        cache.clear(owner.id)
        cache.store(owner.id, {"items": [{"stock_id": 99, "symbol": "OLD"}]})

        async def failing_refresh(_stocks):
            raise RuntimeError("Yahoo timed out")

        monkeypatch.setattr(workbench_api, "_build_intraday_preview_payload", failing_refresh)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            failed = await client.get("/api/v1/workbench/intraday-preview?refresh=true")
        assert failed.json()["items"] == [{"stock_id": 99, "symbol": "OLD"}]
        await cache.wait(owner.id)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            preserved = await client.get("/api/v1/workbench/intraday-preview")
        assert preserved.json()["items"] == [{"stock_id": 99, "symbol": "OLD"}]
        assert "Yahoo timed out" in preserved.json()["refresh_error"]
    finally:
        app.dependency_overrides.clear()
        cache.clear()
        await engine.dispose()
