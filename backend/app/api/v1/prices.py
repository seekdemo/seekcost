"""股价刷新 API"""
import asyncio
from datetime import datetime, timezone
import re
import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset
from app.models.watchlist import WatchStock
from app.core.moving_averages import build_moving_average_series
from app.core.price_volume import build_price_volume_observation
from app.core.price_risk import assess_price_risk
from app.core.market_history import completed_daily_bars
from app.core.price_updater import fetch_prices, to_yahoo_symbol, TRADABLE_CATEGORIES
from app.core.market_history import fetch_daily_bars as _fetch_daily_bars
from app.schemas.prices import DailyBarInput, PriceAnchors, PriceVolumeResponse

router = APIRouter(prefix="/prices", tags=["行情"])


@router.get("/intraday-quote")
async def intraday_quote(
    symbol: str = Query(min_length=1, max_length=40, pattern=r"^[A-Za-z0-9.^=\-]+$"),
    market: str = Query(default="us", pattern=r"^(us|hk|cn|cn_index|crypto|tw|jp|uk|forex)$"),
    current_user: User = Depends(get_current_user),
):
    from app.core.market_quote import get_market_quote
    return await get_market_quote(symbol, market)

RANGE_DAYS = {"1mo": 31, "3mo": 93, "6mo": 186, "1y": 366}

CN_NAME_ALIASES: dict[str, list[str]] = {
    "腾讯": ["00700.HK", "TCEHY"],
    "腾讯控股": ["00700.HK", "TCEHY"],
    "阿里": ["9988.HK", "BABA"],
    "阿里巴巴": ["9988.HK", "BABA"],
    "美团": ["03690.HK", "MPNGY"],
    "小米": ["01810.HK"],
    "小米集团": ["01810.HK"],
    "京东": ["9618.HK", "JD"],
    "百度": ["9888.HK", "BIDU"],
    "网易": ["9999.HK", "NTES"],
    "比亚迪": ["1211.HK", "002594.SZ"],
    "宁德时代": ["300750.SZ"],
    "贵州茅台": ["600519.SS"],
    "茅台": ["600519.SS"],
    "招商银行": ["600036.SS", "3968.HK"],
    "平安": ["601318.SS", "2318.HK"],
    "中国平安": ["601318.SS", "2318.HK"],
    "英伟达": ["NVDA"],
    "苹果": ["AAPL"],
    "微软": ["MSFT"],
    "谷歌": ["GOOGL", "GOOG"],
    "亚马逊": ["AMZN"],
    "特斯拉": ["TSLA"],
    "标普500": ["SPY", "VOO"],
    "纳指": ["QQQ"],
    "纳斯达克": ["QQQ"],
}


def _market_from_yahoo_symbol(symbol: str, exchange: str) -> str:
    if symbol.endswith(".HK") or exchange in {"HKG", "HKSE"}:
        return "hk"
    if symbol.endswith(".SS") or symbol.endswith(".SZ") or exchange in {"SHH", "SHZ", "SSE", "SHE"}:
        return "cn"
    if symbol.endswith(".TW") or exchange in {"TAI", "TWO"}:
        return "tw"
    if "-" in symbol and (exchange == "CCC" or symbol.endswith("-USD")):
        return "crypto"
    return "us"


def _normalize_search_quote(quote: dict) -> dict | None:
    symbol = quote.get("symbol")
    quote_type = quote.get("quoteType")
    allowed_types = {"EQUITY", "ETF", "MUTUALFUND", "CRYPTOCURRENCY"}
    if not symbol or quote_type not in allowed_types:
        return None
    exchange = quote.get("exchange") or ""
    exch_disp = quote.get("exchDisp") or exchange
    market = _market_from_yahoo_symbol(symbol, exchange)
    return {
        "symbol": symbol,
        "name": quote.get("shortname") or quote.get("longname") or symbol,
        "exchange": exch_disp,
        "type": quote_type,
        "market": market,
    }


def _search_priority(item: dict, raw_query: str) -> tuple[int, str]:
    q = raw_query.strip().upper()
    symbol = item["symbol"].upper()
    base_symbol = re.sub(r"\.(HK|SS|SZ|TW)$", "", symbol)
    exact_base = base_symbol == q
    exact_symbol = symbol == q
    market_rank = {"hk": 0, "cn": 1, "us": 2, "crypto": 3, "tw": 4}.get(item.get("market"), 9)
    if exact_symbol:
        return (0, symbol)
    if exact_base:
        return (1 + market_rank, symbol)
    if symbol.startswith(q):
        return (20 + market_rank, symbol)
    return (50 + market_rank, symbol)


def _fetch_quote_meta(symbols: list[str], markets: dict[str, str]) -> dict[str, dict[str, float]]:
    yahoo_map = {sym: to_yahoo_symbol(sym, markets.get(sym, "us")) for sym in symbols}
    reverse_map: dict[str, list[str]] = {}
    for original, yahoo_symbol in yahoo_map.items():
        reverse_map.setdefault(yahoo_symbol, []).append(original)
    result: dict[str, dict[str, float]] = {}
    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    with httpx.Client(timeout=8, headers=headers, follow_redirects=True) as client:
        client.get("https://fc.yahoo.com/v1/test")
        crumb_resp = client.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
        if crumb_resp.status_code != 200:
            return result
        quote_resp = client.get(
            "https://query2.finance.yahoo.com/v7/finance/quote",
            params={"symbols": ",".join(yahoo_map.values()), "crumb": crumb_resp.text.strip()},
        )
        if quote_resp.status_code != 200:
            return result
        for quote in quote_resp.json().get("quoteResponse", {}).get("result", []):
            originals = reverse_map.get(quote.get("symbol"), [])
            if not originals:
                continue
            meta: dict[str, float] = {}
            price = quote.get("regularMarketPrice")
            open_price = quote.get("regularMarketOpen")
            prev_close = quote.get("regularMarketPreviousClose")
            change = quote.get("regularMarketChange")
            change_pct = quote.get("regularMarketChangePercent")
            if change is None and price is not None:
                baseline = open_price if open_price not in (None, 0) else prev_close
                if baseline not in (None, 0):
                    change = float(price) - float(baseline)
            if change_pct is None and change is not None:
                baseline = open_price if open_price not in (None, 0) else prev_close
                if baseline not in (None, 0):
                    change_pct = float(change) / float(baseline) * 100
            if change is not None:
                meta["change"] = round(float(change), 4)
            if change_pct is not None:
                meta["change_pct"] = round(float(change_pct), 4)
            if open_price is not None:
                meta["open"] = round(float(open_price), 4)
            if prev_close is not None:
                meta["prev_close"] = round(float(prev_close), 4)
            if meta:
                for original in originals:
                    result[original] = meta
    return result


def filter_display_bars(items: list[DailyBarInput], range_key: str) -> list[DailyBarInput]:
    if not items:
        return []
    latest = int(items[-1].date)
    cutoff = latest - RANGE_DAYS[range_key] * 86_400
    return [item for item in items if int(item.date) >= cutoff]


@router.get("/search")
async def search_symbol(
    q: str = Query(..., min_length=1, max_length=64),
    user: User = Depends(get_current_user),
):
    """检索股票/ETF 标的，用于股票池快速捕捉前的存在性校验。"""
    del user
    query = q.strip()
    if not query:
        return {"items": []}

    search_terms = [query]
    for alias_symbol in CN_NAME_ALIASES.get(query, []):
        search_terms.insert(0, alias_symbol)
    if re.fullmatch(r"\d{4,5}", query):
        hk_symbol = f"{query.zfill(4)}.HK"
        search_terms.insert(0, hk_symbol)
    if re.fullmatch(r"\d{6}", query):
        suffix = ".SS" if query.startswith("6") else ".SZ"
        search_terms.insert(0, f"{query}{suffix}")
    search_terms = list(dict.fromkeys(search_terms))

    headers = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
    url = "https://query2.finance.yahoo.com/v1/finance/search"
    try:
        async with httpx.AsyncClient(timeout=8, headers=headers, follow_redirects=True) as client:
            data_sets = []
            for term in search_terms:
                params = {
                    "q": term,
                    "quotesCount": 8,
                    "newsCount": 0,
                    "enableFuzzyQuery": "true",
                    "quotesQueryId": "tss_match_phrase_query",
                    "newsQueryId": "news_cie_vespa",
                }
                resp = await client.get(url, params=params)
                resp.raise_for_status()
                data_sets.append(resp.json())
    except Exception:
        return {"items": []}

    items = []
    seen = set()
    for data in data_sets:
        for quote in data.get("quotes", []):
            item = _normalize_search_quote(quote)
            if not item or item["symbol"] in seen:
                continue
            seen.add(item["symbol"])
            items.append(item)
    items.sort(key=lambda item: _search_priority(item, query))
    return {"items": items[:10]}


@router.get("/daily-bars")
async def get_daily_bars(
    symbol: str = Query(..., min_length=1, max_length=32),
    market: str = Query("us", min_length=2, max_length=16),
    range_key: str = Query("6mo", alias="range", min_length=2, max_length=8),
    user: User = Depends(get_current_user),
):
    """获取日线 OHLC 数据，用于股票池详情 K 线展示。"""
    del user
    normalized_symbol = symbol.strip().upper()
    normalized_market = market.strip().lower()
    try:
        return await asyncio.to_thread(_fetch_daily_bars, normalized_symbol, normalized_market, range_key)
    except Exception:
        return {
            "symbol": normalized_symbol,
            "market": normalized_market,
            "range": range_key,
            "currency": "",
            "exchange_timezone": "",
            "items": [],
        }


@router.get("/price-volume", response_model=PriceVolumeResponse)
async def get_price_volume(
    stock_id: int = Query(..., gt=0),
    market: str = Query("us", min_length=2, max_length=16),
    range_key: str = Query("6mo", alias="range", pattern="^(1mo|3mo|6mo|1y)$"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stock = await db.scalar(select(WatchStock).where(WatchStock.id == stock_id, WatchStock.user_id == user.id))
    if stock is None:
        raise HTTPException(404, "Watchlist item not found")

    normalized_market = market.strip().lower()
    try:
        payload = await asyncio.to_thread(_fetch_daily_bars, stock.symbol, normalized_market, "2y")
    except Exception as error:
        raise HTTPException(503, "Price provider is temporarily unavailable") from error

    history = [DailyBarInput.model_validate(item) for item in payload.get("items", [])]
    exchange_timezone = payload.get("exchange_timezone") or {
        "us": "America/New_York", "hk": "Asia/Hong_Kong", "cn": "Asia/Shanghai",
    }.get(normalized_market, "UTC")
    risk_assessment = assess_price_risk(completed_daily_bars(history, exchange_timezone))
    history_averages = build_moving_average_series(history)
    bars = filter_display_bars(history, range_key)
    visible_dates = {item.date for item in bars}
    moving_averages = [item for item in history_averages if item.date in visible_dates]
    observation = build_price_volume_observation(
        bars,
        PriceAnchors(
            fair_price=float(stock.fair_price) if stock.fair_price is not None and stock.fair_price > 0 else None,
            strike_price=float(stock.strike_price) if stock.strike_price is not None and stock.strike_price > 0 else None,
            target_price=float(stock.target_price) if stock.target_price is not None and stock.target_price > 0 else None,
        ),
    )
    as_of = None
    if bars:
        latest_date = bars[-1].date
        as_of = (
            datetime.fromtimestamp(latest_date, timezone.utc).isoformat()
            if isinstance(latest_date, int)
            else latest_date
        )
    data_quality = "complete" if len(bars) >= 120 else "partial" if bars else "empty"
    return PriceVolumeResponse(
        symbol=stock.symbol,
        market=normalized_market,
        range=range_key,
        currency=payload.get("currency") or "",
        exchange_timezone=payload.get("exchange_timezone") or "",
        items=bars,
        moving_averages=moving_averages,
        observation=observation,
        risk_assessment=risk_assessment,
        data_quality=data_quality,
        source="yahoo_finance",
        as_of=as_of,
    )


@router.post("/refresh")
async def refresh_prices(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """手动刷新当前用户所有可交易股票的最新价格（含持仓为0的资产）
    返回价格和时段标签: pre_market/regular/post_market/closed
    """
    stmt = select(Asset).where(
        Asset.user_id == user.id,
        Asset.category.in_(TRADABLE_CATEGORIES),
        Asset.archived == False,
        Asset.is_cash == False,
    )
    rows = await db.execute(stmt)
    assets = rows.scalars().all()
    if not assets:
        return {"updated_count": 0, "prices": {}, "sessions": {}, "error": None, "message": "暂无可交易资产"}

    symbol_map = {a.symbol: a.id for a in assets}
    market_map = {a.symbol: (a.market or "us") for a in assets}

    # 行情拉取是同步阻塞的，放线程池
    try:
        price_data = await asyncio.to_thread(fetch_prices, list(symbol_map.keys()), market_map)
    except RuntimeError as e:
        return {"updated_count": 0, "prices": {}, "sessions": {}, "error": str(e), "message": None}

    updated: dict[str, float] = {}
    sessions: dict[str, str] = {}
    for sym, (price, session) in price_data.items():
        asset_id = symbol_map.get(sym)
        if asset_id:
            await db.execute(
                update(Asset).where(Asset.id == asset_id).values(
                    current_price=price, price_session=session
                )
            )
            updated[sym] = price
            sessions[sym] = session

    if updated:
        await db.commit()

    return {"updated_count": len(updated), "prices": updated, "sessions": sessions, "error": None, "message": None}


@router.post("/quotes")
async def quote_symbols(
    body: dict,
    user: User = Depends(get_current_user),
):
    """获取股票池标的现价，不写入资产表。"""
    del user
    raw_items = body.get("items") or []
    if not isinstance(raw_items, list) or not raw_items:
        return {"updated_count": 0, "prices": {}, "sessions": {}, "error": None, "message": "暂无可刷新的标的"}

    market_map: dict[str, str] = {}
    for item in raw_items[:500]:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").strip().upper()
        market = str(item.get("market") or "us").strip().lower()
        if symbol:
            market_map[symbol] = market

    if not market_map:
        return {"updated_count": 0, "prices": {}, "sessions": {}, "error": None, "message": "暂无有效代码"}

    try:
        price_data = await asyncio.to_thread(fetch_prices, list(market_map.keys()), market_map)
    except RuntimeError as e:
        return {"updated_count": 0, "prices": {}, "sessions": {}, "error": str(e), "message": None}

    try:
        quote_meta = await asyncio.to_thread(_fetch_quote_meta, list(price_data.keys()), market_map)
    except Exception:
        quote_meta = {}

    prices = {sym: price for sym, (price, _session) in price_data.items()}
    sessions = {sym: session for sym, (_price, session) in price_data.items()}
    changes = {sym: meta["change"] for sym, meta in quote_meta.items() if "change" in meta}
    change_pcts = {sym: meta["change_pct"] for sym, meta in quote_meta.items() if "change_pct" in meta}
    opens = {sym: meta["open"] for sym, meta in quote_meta.items() if "open" in meta}
    prev_closes = {sym: meta["prev_close"] for sym, meta in quote_meta.items() if "prev_close" in meta}
    return {
        "updated_count": len(prices),
        "prices": prices,
        "sessions": sessions,
        "changes": changes,
        "change_pcts": change_pcts,
        "opens": opens,
        "prev_closes": prev_closes,
        "error": None,
        "message": None,
    }
