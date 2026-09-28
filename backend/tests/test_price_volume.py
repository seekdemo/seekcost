import math
from datetime import datetime, timezone
from statistics import stdev

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.v1 import prices as prices_api
from app.core.database import Base, get_db
from app.core.price_volume import build_price_volume_observation
from app.core.security import get_current_user
from app.main import app
from app.models.user import User
from app.models.watchlist import WatchStock
from app.schemas.prices import DailyBarInput, PriceAnchors


def _bars(count: int = 130) -> list[DailyBarInput]:
    rows = []
    for index in range(count):
        close = 80 + index * 0.4 + math.sin(index / 5) * 2
        rows.append(DailyBarInput(
            date=index,
            open=close - 0.5,
            high=close + 1.2,
            low=close - 1.0,
            close=close,
            volume=1_000 + index * 10,
        ))
    return rows


def test_price_volume_observation_has_deterministic_auditable_metrics():
    bars = _bars()
    result = build_price_volume_observation(
        bars,
        PriceAnchors(fair_price=125, strike_price=110, target_price=145),
    )
    closes = [item.close for item in bars]
    returns = [closes[index] / closes[index - 1] - 1 for index in range(1, len(closes))]
    true_ranges = [
        max(
            bars[index].high - bars[index].low,
            abs(bars[index].high - bars[index - 1].close),
            abs(bars[index].low - bars[index - 1].close),
        )
        for index in range(1, len(bars))
    ]
    peak = closes[0]
    expected_drawdown = 0.0
    for close in closes:
        peak = max(peak, close)
        expected_drawdown = min(expected_drawdown, close / peak - 1)

    assert result.ma20 == pytest.approx(sum(closes[-20:]) / 20)
    assert result.ma60 == pytest.approx(sum(closes[-60:]) / 60)
    assert result.ma120 == pytest.approx(sum(closes[-120:]) / 120)
    assert result.ma5 == pytest.approx(sum(closes[-5:]) / 5)
    total_volume20 = sum(item.volume for item in bars[-20:])
    assert result.vwap20 == pytest.approx(sum(((item.high + item.low + item.close) / 3) * item.volume for item in bars[-20:]) / total_volume20)
    total_volume60 = sum(item.volume for item in bars[-60:])
    assert result.vwap60 == pytest.approx(sum(((item.high + item.low + item.close) / 3) * item.volume for item in bars[-60:]) / total_volume60)
    assert result.annualized_volatility == pytest.approx(stdev(returns) * math.sqrt(252))
    assert result.atr14 == pytest.approx(sum(true_ranges[-14:]) / 14)
    assert result.max_drawdown == pytest.approx(expected_drawdown)
    assert result.relative_volume20 == pytest.approx(bars[-1].volume / (sum(item.volume for item in bars[-21:-1]) / 20))
    assert result.support60 == min(item.low for item in bars[-61:-1])
    assert result.resistance60 == max(item.high for item in bars[-61:-1])
    assert result.support20 == min(item.low for item in bars[-21:-1])
    assert result.resistance20 == max(item.high for item in bars[-21:-1])
    assert result.trend_basis and "MA60" in result.trend_basis
    assert result.volume_basis and "20" in result.volume_basis
    assert result.volatility_basis and "252" in result.volatility_basis
    assert result.drawdown_basis and "drawdown" in result.drawdown_basis.lower()
    assert result.position_basis and "target" in result.position_basis.lower()
    assert result.divergence_basis


def test_price_volume_observation_handles_short_flat_and_zero_volume_history():
    short = build_price_volume_observation(_bars(12), PriceAnchors())
    assert short.ma20 is None
    assert short.ma5 is not None
    assert short.vwap20 is None
    assert short.relative_volume20 is None
    assert short.support60 is None

    flat = [
        DailyBarInput(date=index, open=10, high=10, low=10, close=10, volume=0)
        for index in range(130)
    ]
    result = build_price_volume_observation(flat, PriceAnchors())
    assert result.annualized_volatility == 0
    assert result.atr14 == 0
    assert result.max_drawdown == 0
    assert result.relative_volume20 is None


def test_display_range_is_relative_to_latest_market_bar():
    items = _bars(400)
    for index, item in enumerate(items):
        item.date = 1_700_000_000 + index * 86_400

    visible = prices_api.filter_display_bars(items, "1mo")

    assert visible[-1].date == items[-1].date
    assert visible[0].date >= int(items[-1].date) - 31 * 86_400
    assert len(visible) == 32


@pytest.mark.asyncio
async def test_price_volume_route_is_owner_scoped_and_distinguishes_provider_failure(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="price-volume-owner", hashed_password="x")
        other = User(username="price-volume-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        stock = WatchStock(user_id=owner.id, symbol="OWN", fair_price=12, strike_price=0, target_price=15)
        db.add(stock)
        await db.commit()

    current_user = {"value": owner}

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return current_user["value"]

    history = _bars(520)
    for index, item in enumerate(history):
        item.date = 1_700_000_000 + index * 86_400
    provider_ranges: list[str] = []

    def fetch_history(_symbol: str, _market: str, range_key: str):
        provider_ranges.append(range_key)
        return {
            "symbol": "OWN",
            "market": "us",
            "range": range_key,
            "currency": "USD",
            "items": [item.model_dump() for item in history],
        }

    monkeypatch.setattr(prices_api, "_fetch_daily_bars", fetch_history)
    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/prices/price-volume?stock_id={stock.id}&market=us&range=6mo")
            assert response.status_code == 200
            body = response.json()
            assert provider_ranges == ["2y"]
            assert body["range"] == "6mo"
            assert len(body["items"]) == 187
            assert len(body["moving_averages"]) == len(body["items"])
            assert [row["date"] for row in body["moving_averages"]] == [row["date"] for row in body["items"]]
            assert body["moving_averages"][0]["ma250"] is not None
            assert body["observation"]["ma120"] is not None
            assert body["data_quality"] == "complete"
            assert body["source"] == "yahoo_finance"
            assert body["as_of"] is not None
            assert "strike anchor" not in body["observation"]["position_basis"]

            current_user["value"] = other
            assert (await client.get(f"/api/v1/prices/price-volume?stock_id={stock.id}&market=us&range=6mo")).status_code == 404
            current_user["value"] = owner
            monkeypatch.setattr(prices_api, "_fetch_daily_bars", lambda *_args: (_ for _ in ()).throw(RuntimeError("down")))
            failed = await client.get(f"/api/v1/prices/price-volume?stock_id={stock.id}&market=us&range=6mo")
            assert failed.status_code == 503
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
