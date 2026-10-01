"""Read-only regular-session mini charts; bounded, coalesced provider requests."""
import asyncio
import math
import time
from datetime import datetime
from zoneinfo import ZoneInfo

import httpx

from app.core.price_updater import to_yahoo_symbol

_cache: dict[tuple[str, str], tuple[float, dict]] = {}
_pending: dict[tuple[str, str], asyncio.Task] = {}
_capacity = asyncio.Semaphore(4)


def _positive(value):
    try:
        number = float(value)
        return number if math.isfinite(number) and number > 0 else None
    except (TypeError, ValueError):
        return None


def normalize_quote(result: dict) -> dict:
    meta = result.get("meta") or {}
    tz = ZoneInfo(meta.get("exchangeTimezoneName") or "UTC")
    series = ((result.get("indicators") or {}).get("quote") or [{}])[0]
    closes = series.get("close") or []
    volumes = series.get("volume") or []
    points = []
    for index, (timestamp, close) in enumerate(zip(result.get("timestamp") or [], closes)):
        price = _positive(close)
        if price is not None and isinstance(timestamp, (int, float)) and math.isfinite(timestamp):
            volume = volumes[index] if index < len(volumes) else None
            if isinstance(volume, bool) or not isinstance(volume, (int, float)) or not math.isfinite(volume) or volume < 0:
                volume = None
            points.append({"timestamp": int(timestamp), "price": price, "volume": volume})
    points = sorted({point["timestamp"]: point for point in points}.values(), key=lambda p: p["timestamp"])
    if not points:
        raise ValueError("No intraday prices")
    session = datetime.fromtimestamp(points[-1]["timestamp"], tz).date()
    points = [p for p in points if datetime.fromtimestamp(p["timestamp"], tz).date() == session]
    previous = _positive(meta.get("previousClose")) or _positive(meta.get("chartPreviousClose"))
    price = points[-1]["price"]
    regular = (meta.get("currentTradingPeriod") or {}).get("regular") or {}
    return {
        "status": "available", "price": price, "previous_close": previous,
        "change_pct": (price / previous - 1) * 100 if previous else None,
        "points": points, "as_of": points[-1]["timestamp"],
        "session_date": session.isoformat(), "currency": meta.get("currency") or "",
        "source": "Yahoo Finance", "interval": "5m",
        "session_start": regular.get("start"), "session_end": regular.get("end"),
    }


def _fetch(symbol: str, market: str) -> dict:
    yahoo = to_yahoo_symbol(symbol, market)
    with httpx.Client(timeout=8, follow_redirects=True, headers={"User-Agent": "Mozilla/5.0"}) as client:
        for host in ("query1", "query2"):
            try:
                response = client.get(f"https://{host}.finance.yahoo.com/v8/finance/chart/{yahoo}",
                                      params={"interval": "5m", "range": "1d", "includePrePost": "false"})
                response.raise_for_status()
                chart = response.json().get("chart") or {}
                if chart.get("error") or not chart.get("result"):
                    raise ValueError("Provider unavailable")
                return normalize_quote(chart["result"][0])
            except (httpx.HTTPError, ValueError, KeyError, TypeError):
                if host == "query2":
                    raise
    raise ValueError("Provider unavailable")


async def _load(key: tuple[str, str]) -> dict:
    try:
        async with _capacity:
            try:
                result = await asyncio.to_thread(_fetch, *key)
                ttl = 60
            except Exception:
                result = {"status": "unavailable", "price": None, "previous_close": None,
                          "change_pct": None, "points": [], "as_of": None,
                          "source": "Yahoo Finance", "currency": "", "interval": "5m"}
                ttl = 20
            if len(_cache) >= 512:
                _cache.pop(next(iter(_cache)))
            _cache[key] = (time.monotonic() + ttl, result)
            return result
    finally:
        _pending.pop(key, None)


async def get_market_quote(symbol: str, market: str) -> dict:
    key = (symbol.strip().upper(), market)
    cached = _cache.get(key)
    if cached and cached[0] > time.monotonic():
        return cached[1]
    if key not in _pending:
        # Bound queued work too: callers can retry on their next refresh.
        if len(_pending) >= 64:
            return {"status": "unavailable", "price": None, "previous_close": None,
                    "change_pct": None, "points": [], "as_of": None, "source": "Yahoo Finance"}
        _pending[key] = asyncio.create_task(_load(key))
    return await asyncio.shield(_pending[key])
