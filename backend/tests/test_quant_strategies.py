from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.v1 import quant_strategies as quant_api
from app.core.database import Base, get_db
from app.core.quant_strategies import (
    PRICE_ANCHOR_STRATEGY_KEY,
    STRATEGY_KEY,
    VOLUME_RATIO_STRATEGY_KEY,
)
from app.core import price_anchor_monitor
from app.core.security import get_current_user
from app.main import app
from app.models.asset import Asset, AssetCategory, AssetMarket, AssetZone
from app.models.quant_strategy import QuantSignalSnapshot
from app.models.user import User
from app.models.watchlist import WatchStock


def _history(closes: list[float], volumes: list[int] | None = None) -> dict:
    volumes = volumes or [100] * len(closes)
    start = int(datetime(2025, 1, 2, tzinfo=timezone.utc).timestamp())
    return {
        "symbol": "TEST",
        "market": "us",
        "range": "2y",
        "currency": "USD",
        "exchange_timezone": "America/New_York",
        "items": [
            {
                "date": start + index * 86_400,
                "open": close,
                "high": close + 1,
                "low": close - 1,
                "close": close,
                "volume": volumes[index],
            }
            for index, close in enumerate(closes)
        ],
    }


@pytest.mark.asyncio
async def test_quant_strategy_lifecycle_is_private_and_returns_latest_snapshot(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="quant-owner", hashed_password="x")
        other = User(username="quant-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        scan_stock = WatchStock(user_id=owner.id, symbol="SCAN", name="Scan Corp")
        unqualified_stock = WatchStock(user_id=owner.id, symbol="PRIVATE", name="Private Corp")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER", name="Other Corp")
        db.add_all([scan_stock, unqualified_stock, other_stock])
        await db.flush()
        # Another user's same-symbol position must never make the owner's stock look held.
        db.add(
            Asset(
                user_id=other.id,
                symbol="PRIVATE",
                name="Other private position",
                zone=AssetZone.ACTIVE,
                category=AssetCategory.STOCK,
                market=AssetMarket.US,
                quantity=10,
                broker_cost=999,
            )
        )
        await db.commit()
        owner_id = owner.id
        other_id = other.id
        scan_stock_id = scan_stock.id
        unqualified_stock_id = unqualified_stock.id
        other_stock_id = other_stock.id

    current_user_id = {"value": owner_id}

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        async with sessions() as db:
            return await db.get(User, current_user_id["value"])

    provider_calls: list[tuple[str, str, str]] = []
    completed_timezones: list[str] = []
    original_completed_daily_bars = quant_api.completed_daily_bars

    def fetch_history(symbol: str, market: str, range_key: str):
        provider_calls.append((symbol, market, range_key))
        result = _history([10, 10, 10, 10, 11, 12, 13, 14, 15, 16, 17, 18])
        result["exchange_timezone"] = ""
        return result

    def track_completed_bars(bars, exchange_timezone):
        completed_timezones.append(exchange_timezone)
        return original_completed_daily_bars(bars, exchange_timezone)

    monkeypatch.setattr(quant_api, "fetch_daily_bars", fetch_history)
    monkeypatch.setattr(quant_api, "completed_daily_bars", track_completed_bars)
    monkeypatch.setattr(price_anchor_monitor, "fetch_daily_bars", fetch_history)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            strategies = await client.get("/api/v1/quant-strategies")
            assert strategies.status_code == 200
            assert strategies.json()[0]["strategy_key"] == STRATEGY_KEY
            assert strategies.json()[0]["enabled"] is False
            assert strategies.json()[0]["parameters"]["volume_multiplier"] == 1.45
            volume_strategy = next(
                item for item in strategies.json()
                if item["strategy_key"] == VOLUME_RATIO_STRATEGY_KEY
            )
            assert volume_strategy["enabled"] is False
            assert volume_strategy["parameters"]["lookback_sessions"] == 3
            anchor_strategy = next(
                item for item in strategies.json()
                if item["strategy_key"] == PRICE_ANCHOR_STRATEGY_KEY
            )
            assert anchor_strategy["enabled"] is False
            assert anchor_strategy["strategy_version"] == "1.0.0"
            assert anchor_strategy["parameters"]["anchor_proximity_pct"] == 0.02

            disabled = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert disabled.status_code == 409

            enabled = await client.patch(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}", json={"enabled": True}
            )
            assert enabled.status_code == 200
            assert enabled.json()["enabled"] is True

            monitored = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{unqualified_stock_id}/scan"
            )
            assert monitored.status_code == 200
            assert monitored.json()["signal"] == "hold_trend"
            assert monitored.json()["source"] == "yahoo_finance"
            assert provider_calls[-1] == ("PRIVATE", "us", "2y")

            qualified = await client.put(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{scan_stock_id}/qualification",
                json={
                    "historical_low": True,
                    "valuation_low": True,
                    "attention_low": True,
                    "note": "Manual review complete",
                },
            )
            assert qualified.status_code == 200
            assert qualified.json()["qualified"] is True
            assert qualified.json()["complete"] is True

            volume_disabled = await client.post(
                f"/api/v1/quant-strategies/{VOLUME_RATIO_STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert volume_disabled.status_code == 409

            volume_enabled = await client.patch(
                f"/api/v1/quant-strategies/{VOLUME_RATIO_STRATEGY_KEY}",
                json={"enabled": True},
            )
            assert volume_enabled.status_code == 200
            assert volume_enabled.json()["enabled"] is True

            volume_scan = await client.post(
                f"/api/v1/quant-strategies/{VOLUME_RATIO_STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert volume_scan.status_code == 200
            assert volume_scan.json()["strategy_key"] == VOLUME_RATIO_STRATEGY_KEY
            assert volume_scan.json()["strategy_version"] == "1.0.0"
            assert volume_scan.json()["signal"] == "volume_observation"
            assert volume_scan.json()["metrics"]["latest_volume"] == 100
            assert volume_scan.json()["metrics"]["prior_average_volume"] == 100
            assert volume_scan.json()["metrics"]["volume_ratio_3d"] == 1

            anchor_enabled = await client.patch(
                f"/api/v1/quant-strategies/{PRICE_ANCHOR_STRATEGY_KEY}",
                json={"enabled": True},
            )
            assert anchor_enabled.status_code == 200
            before_anchor = await client.get(
                f"/api/v1/quant-strategies/{PRICE_ANCHOR_STRATEGY_KEY}/stocks"
            )
            anchor_scan = await client.post(
                f"/api/v1/quant-strategies/{PRICE_ANCHOR_STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            anchor_rescan = await client.post(
                f"/api/v1/quant-strategies/{PRICE_ANCHOR_STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert before_anchor.status_code == 200
            assert anchor_scan.status_code == 200
            assert anchor_scan.json()["strategy_key"] == PRICE_ANCHOR_STRATEGY_KEY
            assert anchor_scan.json()["signal"] == "insufficient_data"
            assert anchor_rescan.json()["id"] == anchor_scan.json()["id"]

            first = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert first.status_code == 200
            assert first.json()["strategy_version"] == "1.1.0"
            assert first.json()["source"] == "yahoo_finance"
            assert first.json()["bar_date"]
            assert first.json()["reason_codes"]
            assert provider_calls[-1] == ("SCAN", "us", "2y")
            assert completed_timezones[-1] == "America/New_York"

            second = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{scan_stock_id}/scan"
            )
            assert second.status_code == 200
            assert second.json()["id"] > first.json()["id"]

            stocks = await client.get(f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks")
            assert stocks.status_code == 200
            owner_rows = stocks.json()
            assert {row["stock_id"] for row in owner_rows} == {scan_stock_id, unqualified_stock_id}
            scan_row = next(row for row in owner_rows if row["stock_id"] == scan_stock_id)
            assert scan_row["latest_snapshot"]["id"] == second.json()["id"]
            assert scan_row["qualification"]["qualified"] is True
            assert next(row for row in owner_rows if row["stock_id"] == unqualified_stock_id)["has_position"] is False

            current_user_id["value"] = other_id
            other_strategies = await client.get("/api/v1/quant-strategies")
            assert other_strategies.json()[0]["enabled"] is False
            other_volume_strategy = next(
                item for item in other_strategies.json()
                if item["strategy_key"] == VOLUME_RATIO_STRATEGY_KEY
            )
            assert other_volume_strategy["enabled"] is False
            other_anchor_strategy = next(
                item for item in other_strategies.json()
                if item["strategy_key"] == PRICE_ANCHOR_STRATEGY_KEY
            )
            assert other_anchor_strategy["enabled"] is False
            other_rows = await client.get(f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks")
            assert [row["stock_id"] for row in other_rows.json()] == [other_stock_id]
            assert (
                await client.put(
                    f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{scan_stock_id}/qualification",
                    json={"historical_low": True, "valuation_low": True, "attention_low": True},
                )
            ).status_code == 404

        async with sessions() as db:
            assert await db.scalar(select(func.count(QuantSignalSnapshot.id))) == 5
            assert await db.scalar(
                select(func.count(QuantSignalSnapshot.id)).where(
                    QuantSignalSnapshot.user_id == other_id
                )
            ) == 0
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_holding_risk_scan_ignores_missing_qualification_and_sanitizes_provider_errors(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        user = User(username="risk-owner", hashed_password="x")
        db.add(user)
        await db.flush()
        stock = WatchStock(user_id=user.id, symbol="RISK.US", name="Risk Corp")
        db.add(stock)
        await db.flush()
        db.add(
            Asset(
                user_id=user.id,
                symbol="RISK",
                name="Risk position",
                zone=AssetZone.ACTIVE,
                category=AssetCategory.ETF,
                market=AssetMarket.US,
                quantity=5,
                broker_cost=120,
            )
        )
        db.add(
            Asset(
                user_id=user.id,
                symbol="RISK",
                name="Broker cash",
                zone=AssetZone.ACTIVE,
                category=AssetCategory.STOCK,
                market=AssetMarket.US,
                quantity=999,
                broker_cost=1000,
                is_cash=True,
            )
        )
        await db.commit()
        user_id = user.id
        stock_id = stock.id

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        async with sessions() as db:
            return await db.get(User, user_id)

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            await client.patch(f"/api/v1/quant-strategies/{STRATEGY_KEY}", json={"enabled": True})
            monkeypatch.setattr(
                quant_api,
                "fetch_daily_bars",
                lambda *_args: _history([110] * 8 + [109, 108, 107, 90]),
            )
            risk = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{stock_id}/scan"
            )
            assert risk.status_code == 200
            assert risk.json()["signal"] == "risk_exit"
            assert "hard_stop" in risk.json()["reason_codes"]
            assert risk.json()["metrics"]["cost_basis"] == 120

            def fail_provider(*_args):
                raise RuntimeError("secret provider credential and internal URL")

            monkeypatch.setattr(quant_api, "fetch_daily_bars", fail_provider)
            failed = await client.post(
                f"/api/v1/quant-strategies/{STRATEGY_KEY}/stocks/{stock_id}/scan"
            )
            assert failed.status_code == 200
            assert failed.json()["signal"] == "provider_error"
            assert failed.json()["error_code"] == "provider_error"
            assert failed.json()["reason_codes"] == ["market_data_unavailable"]
            assert "secret" not in failed.text
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
