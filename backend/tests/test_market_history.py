from datetime import datetime, timezone
import httpx
import pytest

from app.core import market_history


def test_daily_bars_falls_back_after_primary_timeout(monkeypatch):
    calls = []
    class Client(_Client):
        def get(self, url, **kwargs):
            calls.append(url)
            if "query1" in url:
                raise httpx.ReadTimeout("provider timeout")
            return _Response({"chart": {"result": [{
                "timestamp": [1],
                "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10.5], "volume": [120]}]},
                "meta": {"currency": "USD"},
            }]}})
    monkeypatch.setattr(market_history.httpx, "Client", lambda **kwargs: Client(None))
    result = market_history.fetch_daily_bars("BWXT", "us", "2y")
    assert result["items"][0]["close"] == 10.5
    assert len(calls) == 2
    assert "query2" in calls[1]


def test_daily_bars_propagates_failure_when_both_nodes_fail(monkeypatch):
    class Client(_Client):
        def get(self, *args, **kwargs):
            raise httpx.ReadTimeout("provider timeout")
    monkeypatch.setattr(market_history.httpx, "Client", lambda **kwargs: Client(None))
    with pytest.raises(httpx.ReadTimeout):
        market_history.fetch_daily_bars("BWXT", "us")


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def raise_for_status(self):
        return None

    def json(self):
        return self.payload


class _Client:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return None

    def get(self, *_args, **_kwargs):
        return _Response(self.payload)


def test_fetch_intraday_bars_normalizes_chart_payload(monkeypatch):
    payload = {
        "chart": {
            "result": [{
                "timestamp": [1],
                "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10.5], "volume": [120]}]},
                "meta": {"currency": "USD", "exchangeTimezoneName": "America/New_York"},
            }],
        },
    }
    monkeypatch.setattr(market_history.httpx, "Client", lambda *_args, **_kwargs: _Client(payload))
    result = market_history.fetch_intraday_bars("AAPL", "us")
    assert result["exchange_timezone"] == "America/New_York"
    assert result["items"] == [{
        "timestamp": 1,
        "open": 10.0,
        "high": 11.0,
        "low": 9.0,
        "close": 10.5,
        "volume": 120,
    }]


def test_intraday_cumulative_volume_ignores_future_bars():
    result = market_history.intraday_cumulative_volume(
        [
            {"timestamp": 1710345600, "volume": 10},
            {"timestamp": 1710349200, "volume": 30},
            {"timestamp": 1710352800, "volume": 50},
        ],
        "America/New_York",
        datetime.fromtimestamp(1710349200, timezone.utc),
    )
    assert result[1] == 40
