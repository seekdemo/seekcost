"""Yahoo daily-bar provider and completed-session filtering shared by market features."""
from datetime import date, datetime, time, timezone
import re
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import httpx

from app.core.price_updater import to_yahoo_symbol
from app.schemas.prices import DailyBarInput

_ALLOWED_RANGES = {"1mo", "3mo", "6mo", "1y", "2y"}
_INTRADAY_INTERVALS = {"1m", "2m", "5m", "15m", "30m", "60m"}
_INTRADAY_RANGES = {"1d", "5d", "1mo"}
_COMPLETED_SESSION_CUTOFF = time(16, 15)


def infer_watch_market(symbol: str, sector: str = "") -> str:
    """Infer a Yahoo market from a watchlist symbol when no asset market exists."""
    normalized = symbol.strip().upper()
    sector_text = sector.strip().lower()
    if "crypto" in sector_text or normalized.endswith("-USD"):
        return "crypto"
    if normalized.endswith(".HK") or re.fullmatch(r"\d{4,5}", normalized):
        return "hk"
    if normalized.endswith((".SS", ".SH", ".SZ", ".BJ")) or re.fullmatch(r"\d{6}", normalized):
        return "cn"
    if normalized.endswith(".TW"):
        return "tw"
    return "us"


def fetch_daily_bars(symbol: str, market: str, range_key: str = "6mo") -> dict:
    """Fetch normalized Yahoo daily OHLCV bars without applying strategy rules."""
    yahoo_symbol = to_yahoo_symbol(symbol, market)
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    chart_range = range_key if range_key in _ALLOWED_RANGES else "6mo"
    with httpx.Client(timeout=8, headers=headers, follow_redirects=True) as client:
        # A transient failure on one Yahoo node must not blank the chart.
        for host in ("query1", "query2"):
            try:
                response = client.get(
                    f"https://{host}.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}",
                    params={"interval": "1d", "range": chart_range, "includePrePost": "false", "events": "div,splits"},
                )
                response.raise_for_status()
                payload = response.json().get("chart", {})
                if payload.get("error"):
                    raise ValueError("Yahoo chart returned a provider error")
                break
            except (httpx.HTTPError, ValueError):
                if host == "query2":
                    raise
        result = (payload.get("result") or [None])[0]
        if not result:
            return {"symbol": symbol, "market": market, "range": chart_range, "currency": "", "items": []}

        timestamps = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []
        bars = []
        for index, timestamp in enumerate(timestamps):
            open_price = opens[index] if index < len(opens) else None
            high = highs[index] if index < len(highs) else None
            low = lows[index] if index < len(lows) else None
            close = closes[index] if index < len(closes) else None
            if None in (open_price, high, low, close):
                continue
            bars.append({
                "date": int(timestamp),
                "open": round(float(open_price), 4),
                "high": round(float(high), 4),
                "low": round(float(low), 4),
                "close": round(float(close), 4),
                "volume": int(volumes[index]) if index < len(volumes) and volumes[index] is not None else 0,
            })
        meta = result.get("meta") or {}
        return {
            "symbol": symbol,
            "market": market,
            "range": chart_range,
            "currency": meta.get("currency") or "",
            "exchange_timezone": meta.get("exchangeTimezoneName") or "",
            "items": bars,
        }


def fetch_intraday_bars(
    symbol: str,
    market: str,
    interval: str = "5m",
    range_key: str = "5d",
) -> dict:
    """Fetch short-interval Yahoo bars for provisional, non-persisted observations.

    The five-day window is intentional: it gives the monitor up to three prior
    sessions for same-clock cumulative-volume comparison while keeping the
    response small enough for a manual workbench refresh.
    """
    yahoo_symbol = to_yahoo_symbol(symbol, market)
    selected_interval = interval if interval in _INTRADAY_INTERVALS else "5m"
    selected_range = range_key if range_key in _INTRADAY_RANGES else "5d"
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    with httpx.Client(timeout=8, headers=headers, follow_redirects=True) as client:
        response = client.get(
            f"https://query1.finance.yahoo.com/v8/finance/chart/{yahoo_symbol}",
            params={
                "interval": selected_interval,
                "range": selected_range,
                "includePrePost": "false",
                "events": "div,splits",
            },
        )
        response.raise_for_status()
        payload = response.json().get("chart", {})
        result = (payload.get("result") or [None])[0]
        if not result:
            return {
                "symbol": symbol,
                "market": market,
                "interval": selected_interval,
                "range": selected_range,
                "currency": "",
                "exchange_timezone": "",
                "items": [],
            }

        timestamps = result.get("timestamp") or []
        quote = ((result.get("indicators") or {}).get("quote") or [{}])[0]
        opens = quote.get("open") or []
        highs = quote.get("high") or []
        lows = quote.get("low") or []
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []
        bars = []
        for index, timestamp in enumerate(timestamps):
            values = (
                opens[index] if index < len(opens) else None,
                highs[index] if index < len(highs) else None,
                lows[index] if index < len(lows) else None,
                closes[index] if index < len(closes) else None,
            )
            if any(value is None for value in values):
                continue
            bars.append({
                "timestamp": int(timestamp),
                "open": round(float(values[0]), 4),
                "high": round(float(values[1]), 4),
                "low": round(float(values[2]), 4),
                "close": round(float(values[3]), 4),
                "volume": int(volumes[index]) if index < len(volumes) and volumes[index] is not None else 0,
            })
        meta = result.get("meta") or {}
        return {
            "symbol": symbol,
            "market": market,
            "interval": selected_interval,
            "range": selected_range,
            "currency": meta.get("currency") or "",
            "exchange_timezone": meta.get("exchangeTimezoneName") or "",
            "items": bars,
        }


def _bar_local_date(bar_date: int | str, exchange_timezone: ZoneInfo) -> date | None:
    if isinstance(bar_date, int):
        return datetime.fromtimestamp(bar_date, timezone.utc).astimezone(exchange_timezone).date()
    try:
        return datetime.fromisoformat(bar_date.replace("Z", "+00:00")).date()
    except ValueError:
        return None


def completed_session_key(timestamp: int | str, exchange_timezone: str) -> str | None:
    """Return the exchange-local calendar date for an intraday timestamp."""
    try:
        market_timezone = ZoneInfo(exchange_timezone)
    except ZoneInfoNotFoundError:
        return None
    if isinstance(timestamp, int):
        return datetime.fromtimestamp(timestamp, timezone.utc).astimezone(market_timezone).date().isoformat()
    try:
        parsed = datetime.fromisoformat(str(timestamp).replace("Z", "+00:00"))
    except ValueError:
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(market_timezone).date().isoformat()


def intraday_cumulative_volume(
    items: list[dict],
    exchange_timezone: str,
    now: datetime | None = None,
) -> tuple[str | None, float | None]:
    """Return the latest session key and volume accumulated through ``now``."""
    if not items:
        return None, None
    try:
        market_timezone = ZoneInfo(exchange_timezone)
    except ZoneInfoNotFoundError:
        return None, None
    current = now or datetime.now(timezone.utc)
    current_utc = current if current.tzinfo else current.replace(tzinfo=timezone.utc)
    current_local = current_utc.astimezone(market_timezone)
    dated = []
    for item in items:
        timestamp = item.get("timestamp")
        if timestamp is None:
            continue
        try:
            moment = datetime.fromtimestamp(int(timestamp), timezone.utc).astimezone(market_timezone)
        except (TypeError, ValueError, OSError):
            continue
        if moment > current_local:
            continue
        dated.append((moment, float(item.get("volume") or 0)))
    if not dated:
        return None, None
    latest_session = max(moment.date() for moment, _volume in dated)
    cumulative = sum(volume for moment, volume in dated if moment.date() == latest_session)
    return latest_session.isoformat(), cumulative


def completed_daily_bars(
    bars: list[DailyBarInput],
    exchange_timezone: str,
    *,
    now: datetime | None = None,
    cutoff_time: time = _COMPLETED_SESSION_CUTOFF,
) -> list[DailyBarInput]:
    """Exclude Yahoo's same-session daily bar until the market's completion cutoff."""
    if not bars:
        return []
    try:
        market_timezone = ZoneInfo(exchange_timezone)
    except ZoneInfoNotFoundError:
        return list(bars)

    current = now or datetime.now(timezone.utc)
    local_now = current.replace(tzinfo=market_timezone) if current.tzinfo is None else current.astimezone(market_timezone)
    latest_date = _bar_local_date(bars[-1].date, market_timezone)
    if latest_date == local_now.date() and local_now.time() < cutoff_time:
        return list(bars[:-1])
    return list(bars)
