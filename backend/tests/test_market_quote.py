import pytest
import asyncio
import httpx
import app.core.market_quote as market_quote

from app.core.market_quote import normalize_quote


def chart(previous=100):
    return {"meta": {"previousClose": previous, "exchangeTimezoneName": "America/New_York"},
            "timestamp": [1789133400, 1789133700, 1789134000],
            "indicators": {"quote": [{"close": [101, None, 110]}]}}


def test_change_uses_previous_close_and_removes_missing_points():
    result = normalize_quote(chart())
    assert result["change_pct"] == pytest.approx(10)
    assert len(result["points"]) == 2
    assert result["price"] == 110


def test_missing_baseline_does_not_invent_change():
    result = normalize_quote(chart(None))
    assert result["previous_close"] is None
    assert result["change_pct"] is None


def test_non_finite_prices_are_not_json_data():
    data = chart()
    data["indicators"]["quote"][0]["close"] = [float("nan"), float("inf"), 0]
    with pytest.raises(ValueError):
        normalize_quote(data)


def test_only_latest_exchange_session_is_displayed():
    data = chart()
    data["timestamp"][0] -= 86400
    result = normalize_quote(data)
    assert len(result["points"]) == 1


@pytest.mark.asyncio
async def test_requests_are_coalesced_and_cached(monkeypatch):
    calls = []
    def fetch(symbol, market):
        calls.append(symbol)
        return normalize_quote(chart())
    monkeypatch.setattr(market_quote, "_fetch", fetch)
    market_quote._cache.clear()
    results = await asyncio.gather(*(market_quote.get_market_quote("TEST", "us") for _ in range(5)))
    assert all(r["price"] == 110 for r in results)
    await market_quote.get_market_quote("TEST", "us")
    assert calls == ["TEST"]
    market_quote._cache.clear()


@pytest.mark.asyncio
async def test_provider_failure_is_explicit(monkeypatch):
    def fetch(*args):
        raise ValueError("provider down")
    monkeypatch.setattr(market_quote, "_fetch", fetch)
    market_quote._cache.clear()
    result = await market_quote.get_market_quote("ERROR", "us")
    assert result["status"] == "unavailable"
    assert result["points"] == []
    assert result["change_pct"] is None
    market_quote._cache.clear()


@pytest.mark.asyncio
async def test_endpoint_requires_authentication():
    from app.main import app
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/v1/prices/intraday-quote?symbol=AAOI&market=us")
    assert response.status_code in (401, 403)
