from datetime import date, datetime, timezone

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.earnings_calendar import (
    EarningsFetchResult,
    EarningsTarget,
    FetchedEarnings,
    choose_yahoo_earnings_date,
    fetch_earnings_dates,
)
from app.core.security import get_current_user
from app.main import app
from app.models.user import User
from app.models.watchlist import WatchStock
from app.api.v1 import watchlist as watchlist_api


@pytest.mark.asyncio
async def test_earnings_calendar_is_private_to_watchlist_owner():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="earnings-owner", hashed_password="x", nickname="Owner")
        other = User(username="earnings-other", hashed_password="x", nickname="Other")
        db.add_all([owner, other])
        await db.flush()
        owner_stock = WatchStock(user_id=owner.id, symbol="EARN", name="Earnings Co")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER", name="Other Co")
        db.add_all([owner_stock, other_stock])
        await db.commit()
        await db.refresh(owner_stock)
        await db.refresh(other_stock)

    current_user = {"value": owner}

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return current_user["value"]

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/v1/watchlist/earnings",
                json={"stock_id": owner_stock.id, "event_date": "2026-08-28", "fiscal_period": "Q2 FY2026", "status": "confirmed"},
            )
            assert created.status_code == 201
            assert created.json()["symbol"] == "EARN"
            assert created.json()["event_date"] == date(2026, 8, 28).isoformat()
            assert created.json()["source"] == "manual"

            event_id = created.json()["id"]
            assert len((await client.get("/api/v1/watchlist/earnings")).json()) == 1
            assert (await client.post("/api/v1/watchlist/earnings", json={"stock_id": other_stock.id, "event_date": "2026-08-29"})).status_code == 404

            current_user["value"] = other
            assert (await client.get("/api/v1/watchlist/earnings")).json() == []
            assert (await client.patch(f"/api/v1/watchlist/earnings/{event_id}", json={"status": "reported"})).status_code == 404
            assert (await client.delete(f"/api/v1/watchlist/earnings/{event_id}")).status_code == 404
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_yahoo_date_normalization_ignores_stale_point_date():
    today = date(2026, 8, 8)
    quote = {
        "earningsTimestamp": int(datetime(2026, 7, 30, tzinfo=timezone.utc).timestamp()),
        "earningsTimestampStart": int(datetime(2026, 10, 29, tzinfo=timezone.utc).timestamp()),
        "earningsTimestampEnd": int(datetime(2026, 11, 2, tzinfo=timezone.utc).timestamp()),
    }
    assert choose_yahoo_earnings_date(quote, today) == date(2026, 10, 29)


def test_provider_dispatch_skips_non_company_symbols(monkeypatch):
    targets = [
        EarningsTarget(stock_id=1, symbol="AAPL", name="Apple"),
        EarningsTarget(stock_id=2, symbol="600519", name="贵州茅台"),
        EarningsTarget(stock_id=3, symbol="SPY", name="SPDR S&P 500 ETF"),
        EarningsTarget(stock_id=4, symbol="000001", name="上证指数"),
    ]

    def fake_yahoo(items, today):
        assert [item.stock_id for item in items] == [1]
        return ({1: FetchedEarnings(1, today, "yahoo")}, set())

    def fake_eastmoney(items, today):
        assert [item.stock_id for item in items] == [2]
        return {2: FetchedEarnings(2, today, "eastmoney", "H1 FY2026", True)}

    monkeypatch.setattr("app.core.earnings_calendar._fetch_yahoo", fake_yahoo)
    monkeypatch.setattr("app.core.earnings_calendar._fetch_eastmoney", fake_eastmoney)
    result = fetch_earnings_dates(targets, date(2026, 8, 8))

    assert set(result.dates) == {1, 2}
    assert result.skipped_ids == {3, 4}
    assert result.unavailable_ids == set()


@pytest.mark.asyncio
async def test_earnings_sync_is_idempotent_and_protects_manual_dates(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="sync-owner", hashed_password="x", nickname="Owner")
        db.add(owner)
        await db.flush()
        manual_stock = WatchStock(user_id=owner.id, symbol="MSFT", name="Microsoft")
        automatic_stock = WatchStock(user_id=owner.id, symbol="AAPL", name="Apple")
        db.add_all([manual_stock, automatic_stock])
        await db.commit()
        await db.refresh(manual_stock)
        await db.refresh(automatic_stock)

    def fetched_dates(_targets):
        return EarningsFetchResult(
            checked=2,
            dates={
                manual_stock.id: FetchedEarnings(manual_stock.id, date(2099, 8, 10), "yahoo"),
                automatic_stock.id: FetchedEarnings(automatic_stock.id, date(2099, 8, 12), "yahoo"),
            },
        )

    monkeypatch.setattr(watchlist_api, "fetch_earnings_dates", fetched_dates)

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return owner

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            manual = await client.post(
                "/api/v1/watchlist/earnings",
                json={"stock_id": manual_stock.id, "event_date": "2099-08-09", "status": "confirmed"},
            )
            assert manual.status_code == 201

            first = await client.post("/api/v1/watchlist/earnings/sync")
            assert first.status_code == 200
            assert first.json()["created"] == 1
            assert first.json()["manual_protected"] == 1

            second = await client.post("/api/v1/watchlist/earnings/sync")
            assert second.json()["created"] == 0
            assert second.json()["unchanged"] == 1
            assert second.json()["manual_protected"] == 1

            events = (await client.get("/api/v1/watchlist/earnings")).json()
            assert len(events) == 2
            automatic = next(event for event in events if event["stock_id"] == automatic_stock.id)
            assert automatic["source"] == "yahoo"
            assert automatic["synced_at"] is not None

            far_manual = await client.post(
                "/api/v1/watchlist/earnings",
                json={"stock_id": automatic_stock.id, "event_date": "2099-12-20", "status": "confirmed"},
            )
            assert far_manual.status_code == 201
            with_far_manual = await client.post("/api/v1/watchlist/earnings/sync")
            assert with_far_manual.json()["unchanged"] == 1
            assert with_far_manual.json()["manual_protected"] == 1

            unavailable = EarningsFetchResult(
                checked=2,
                unavailable_ids={manual_stock.id, automatic_stock.id},
                errors=["yahoo"],
            )
            monkeypatch.setattr(watchlist_api, "fetch_earnings_dates", lambda _targets: unavailable)
            failed_provider = await client.post("/api/v1/watchlist/earnings/sync")
            assert failed_provider.json()["provider_errors"] == ["yahoo"]
            assert len((await client.get("/api/v1/watchlist/earnings")).json()) == 3

            edited = await client.patch(
                f"/api/v1/watchlist/earnings/{automatic['id']}",
                json={"event_date": "2099-08-13"},
            )
            assert edited.json()["source"] == "manual"
            assert edited.json()["synced_at"] is None
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
