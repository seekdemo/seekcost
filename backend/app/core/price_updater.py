"""
股价拉取服务 — 多数据源 fallback 机制，支持美股/港股/A股
优先级：腾讯财经 → 新浪财经 → Yahoo Finance (crumb)
所有数据源均为免费公开接口，无需 API key

根据刷新时刻所处的交易时段，智能选取对应价格并标注时段标签:
  - pre_market   盘前 (美东 04:00-09:30)
  - regular      盘中 (美东 09:30-16:00)
  - post_market  盘后 (美东 16:00-20:00)
  - closed       休市 (美东 20:00-04:00，或周末/节假日)
港股/A股仅区分 regular / closed。
"""
import logging
import re
import httpx
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.asset import Asset, AssetCategory
from app.models.watchlist import WatchStock

logger = logging.getLogger(__name__)

TRADABLE_CATEGORIES = {
    AssetCategory.STOCK,
    AssetCategory.ETF,
    AssetCategory.CRYPTO,
}

_TIMEOUT = 10
_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# 价格结果: {symbol: (price, session_label)}
PriceResult = dict[str, tuple[float, str]]

US_INDEX_YAHOO_ALIASES = {
    ".SPX": "^GSPC",
    "SPX": "^GSPC",
    "GSPC": "^GSPC",
    ".GSPC": "^GSPC",
    ".IXIC": "^IXIC",
    "IXIC": "^IXIC",
    ".VIX": "^VIX",
    "VIX": "^VIX",
    ".DJI": "^DJI",
    "DJI": "^DJI",
    "DJIA": "^DJI",
    ".DJIA": "^DJI",
    ".NDX": "^NDX",
    "NDX": "^NDX",
    ".RUT": "^RUT",
    "RUT": "^RUT",
}

US_FUTURES_YAHOO_ALIASES = {
    "NQMAIN": "NQ=F",
    "ESMAIN": "ES=F",
    "YMMAIN": "YM=F",
    "RTYMAIN": "RTY=F",
    "CLMAIN": "CL=F",
    "GCMAIN": "GC=F",
    "SILMAIN": "SI=F",
}

CN_INDEX_YAHOO_ALIASES = {
    "000001": "000001.SS",
    "000016": "000016.SS",
    "000300": "000300.SS",
    "000905": "000905.SS",
    "000852": "000852.SS",
    "399001": "399001.SZ",
    "399006": "399006.SZ",
}


def _clean_us_symbol(symbol: str) -> str:
    cleaned = symbol.strip().upper().removesuffix(".US")
    if cleaned.startswith("."):
        cleaned = cleaned[1:]
    return cleaned


def _cn_symbol_parts(symbol: str, market: str) -> tuple[str, str]:
    number = re.sub(r"[^0-9]", "", symbol)
    is_shanghai = number.startswith(("5", "6")) or (market == "cn_index" and number.startswith("0"))
    return number, "sh" if is_shanghai else "sz"


# ── 时段判断 ────────────────────────────────────────────
def _us_session_now() -> str:
    """根据当前 UTC 时间判断美股交易时段 (美东 EDT/EST)"""
    now_et = datetime.now(timezone.utc).astimezone(ZoneInfo("America/New_York"))
    # 周末
    if now_et.weekday() >= 5:
        return "closed"
    h, m = now_et.hour, now_et.minute
    t = h * 60 + m  # 分钟数
    if t < 240:       # 00:00-04:00
        return "closed"
    elif t < 570:     # 04:00-09:30
        return "pre_market"
    elif t < 960:     # 09:30-16:00
        return "regular"
    elif t < 1200:    # 16:00-20:00
        return "post_market"
    else:             # 20:00-24:00
        return "closed"


def _hk_session_now() -> str:
    """港股时段 (HKT = UTC+8)"""
    now_utc = datetime.now(timezone.utc)
    now_hk = now_utc + timedelta(hours=8)
    if now_hk.weekday() >= 5:
        return "closed"
    h, m = now_hk.hour, now_hk.minute
    t = h * 60 + m
    # 港股 09:30-12:00, 13:00-16:00
    if (570 <= t < 720) or (780 <= t < 960):
        return "regular"
    return "closed"


def _cn_session_now() -> str:
    """A股时段 (CST = UTC+8)"""
    now_utc = datetime.now(timezone.utc)
    now_cn = now_utc + timedelta(hours=8)
    if now_cn.weekday() >= 5:
        return "closed"
    h, m = now_cn.hour, now_cn.minute
    t = h * 60 + m
    # A股 09:30-11:30, 13:00-15:00
    if (570 <= t < 690) or (780 <= t < 900):
        return "regular"
    return "closed"


def get_market_session(market: str) -> str:
    """获取指定市场的当前交易时段"""
    if market == "us":
        return _us_session_now()
    elif market == "hk":
        return _hk_session_now()
    elif market in {"cn", "cn_index"}:
        return _cn_session_now()
    elif market == "crypto":
        return "regular"  # 加密货币 24h 交易
    return "closed"


def _choose_latest_us_quote(
    *,
    now_utc: datetime,
    regular_price: float = 0.0,
    regular_ts: int | None = None,
    pre_price: float = 0.0,
    pre_ts: int | None = None,
    post_price: float = 0.0,
    post_ts: int | None = None,
    session: str = "closed",
) -> tuple[float, str] | None:
    """选择不晚于当前时刻的最近一笔美股价格。"""
    candidates: list[tuple[float, int, str]] = []

    if regular_price > 0 and regular_ts:
        candidates.append((regular_price, regular_ts, "regular"))
    if pre_price > 0 and pre_ts:
        candidates.append((pre_price, pre_ts, "pre_market"))
    if post_price > 0 and post_ts:
        candidates.append((post_price, post_ts, "post_market"))

    if not candidates:
        return None

    now_epoch = int(now_utc.timestamp())
    valid = [c for c in candidates if c[1] <= now_epoch]
    if not valid:
        price, _, s = max(candidates, key=lambda item: item[1])
        return round(price, 4), s

    if session == "closed":
        closed_prices = [c for c in valid if c[2] == "regular"]
        if closed_prices:
            price, _, s = max(closed_prices, key=lambda item: item[1])
            return round(price, 4), "closed"

    price, _, s = max(valid, key=lambda item: item[1])
    return round(price, 4), s


def _choose_session_fallback_us_price(regular_p: float, ah_p: float, session: str) -> tuple[float, str] | None:
    """无时间戳源的美股兜底：尽量选离当前最近的已知价格。"""
    if session == "post_market" and ah_p > 0:
        return round(ah_p, 4), "post_market"
    if session == "regular" and regular_p > 0:
        return round(regular_p, 4), "regular"
    if regular_p > 0:
        return round(regular_p, 4), "closed"
    if ah_p > 0:
        return round(ah_p, 4), "post_market"
    return None


# ── Key 映射 ───────────────────────────────────────────
def _tencent_key(symbol: str, market: str) -> str:
    if market == "hk":
        num = re.sub(r"\D", "", symbol)
        return f"hk{num.zfill(5)}"
    if market in {"cn", "cn_index"}:
        number, exchange = _cn_symbol_parts(symbol, market)
        return f"{exchange}{number}"
    return f"us{_clean_us_symbol(symbol)}"


def _sina_key(symbol: str, market: str) -> str:
    if market == "hk":
        num = re.sub(r"\D", "", symbol)
        return f"rt_hk{num.zfill(5)}"
    if market in {"cn", "cn_index"}:
        number, exchange = _cn_symbol_parts(symbol, market)
        return f"{exchange}{number}"
    return f"gb_{_clean_us_symbol(symbol).lower()}"


def to_yahoo_symbol(symbol: str, market: str) -> str:
    if market == "hk":
        num = re.sub(r"\D", "", symbol)
        return f"{num.zfill(4)}.HK"
    cleaned = _clean_us_symbol(symbol)
    if market == "cn_index":
        return CN_INDEX_YAHOO_ALIASES.get(cleaned, f"{cleaned}.SS" if cleaned.startswith("0") else f"{cleaned}.SZ")
    if market == "cn":
        number, exchange = _cn_symbol_parts(symbol, market)
        return f"{number}.{'SS' if exchange == 'sh' else 'SZ'}"
    if market == "crypto" and "-" not in cleaned:
        return f"{cleaned}-USD"
    return US_FUTURES_YAHOO_ALIASES.get(cleaned, US_INDEX_YAHOO_ALIASES.get(cleaned, cleaned))


# ── 数据源 1: 腾讯财经 ──────────────────────────────────
def _fetch_from_tencent(symbols: list[str], markets: dict[str, str]) -> PriceResult:
    qq_map = {s: _tencent_key(s, markets.get(s, "us")) for s in symbols}
    query = ",".join(qq_map.values())
    result: PriceResult = {}
    now_utc = datetime.now(timezone.utc)
    with httpx.Client(timeout=_TIMEOUT) as c:
        resp = c.get(f"https://web.sqt.gtimg.cn/q={query}")
        resp.raise_for_status()
        for sym, qq in qq_map.items():
            m = re.search(rf'v_{qq}="(.+?)"', resp.text)
            if not m:
                continue
            fields = m.group(1).split("~")
            if len(fields) < 4:
                continue
            mkt = markets.get(sym, "us")
            session = get_market_session(mkt)
            try:
                p = 0.0
                used_session = session
                if mkt == "us":
                    regular_p = float(fields[3]) if len(fields) > 3 else 0
                    ah_p = float(fields[4]) if len(fields) > 4 else 0
                    chosen = _choose_session_fallback_us_price(regular_p, ah_p, session)
                    if chosen:
                        p, used_session = chosen
                else:
                    p = float(fields[3])
                    used_session = session
                if p > 0:
                    result[sym] = (round(p, 4), used_session)
            except (ValueError, IndexError):
                pass
    return result


# ── 数据源 2: 新浪财经 ──────────────────────────────────
def _fetch_from_sina(symbols: list[str], markets: dict[str, str]) -> PriceResult:
    sina_map = {s: _sina_key(s, markets.get(s, "us")) for s in symbols}
    query = ",".join(sina_map.values())
    result: PriceResult = {}
    headers = {"Referer": "https://finance.sina.com.cn", "User-Agent": _UA}
    with httpx.Client(timeout=_TIMEOUT, headers=headers) as c:
        resp = c.get(f"https://hq.sinajs.cn/list={query}")
        resp.raise_for_status()
        for sym, sina in sina_map.items():
            m = re.search(rf'hq_str_{sina}="(.+?)"', resp.text)
            if not m:
                continue
            fields = m.group(1).split(",")
            mkt = markets.get(sym, "us")
            session = get_market_session(mkt)
            try:
                p = 0.0
                used_session = session
                if mkt == "hk" and len(fields) >= 7:
                    p = float(fields[6])
                    used_session = session
                elif mkt in {"cn", "cn_index"} and len(fields) >= 4:
                    p = float(fields[3])
                    used_session = session
                elif mkt == "us" and len(fields) >= 2:
                    regular_p = float(fields[1])
                    ah_p = float(fields[26]) if len(fields) > 26 else 0
                    chosen = _choose_session_fallback_us_price(regular_p, ah_p, session)
                    if chosen:
                        p, used_session = chosen
                else:
                    continue
                if p > 0:
                    result[sym] = (round(p, 4), used_session)
            except (ValueError, IndexError):
                pass
    return result


# ── 数据源 3: Yahoo Finance (crumb 机制) ────────────────
def _fetch_from_yahoo(symbols: list[str], markets: dict[str, str]) -> PriceResult:
    yahoo_map = {s: to_yahoo_symbol(s, markets.get(s, "us")) for s in symbols}
    reverse_map: dict[str, list[str]] = {}
    for original, yahoo_symbol in yahoo_map.items():
        reverse_map.setdefault(yahoo_symbol, []).append(original)
    result: PriceResult = {}
    now_utc = datetime.now(timezone.utc)
    headers = {"User-Agent": _UA}
    with httpx.Client(timeout=_TIMEOUT, headers=headers, follow_redirects=True) as c:
        c.get("https://fc.yahoo.com/v1/test")
        r2 = c.get("https://query2.finance.yahoo.com/v1/test/getcrumb")
        if r2.status_code != 200:
            return result
        crumb = r2.text.strip()
        sym_str = ",".join(yahoo_map.values())
        r3 = c.get(
            f"https://query2.finance.yahoo.com/v7/finance/quote?symbols={sym_str}&crumb={crumb}"
        )
        if r3.status_code != 200:
            return result
        data = r3.json()
        for q in data.get("quoteResponse", {}).get("result", []):
            ysym = q.get("symbol", "")
            originals = reverse_map.get(ysym, [])
            if not originals:
                continue
            mkt = markets.get(originals[0], "us")
            session = get_market_session(mkt)
            post = float(q.get("postMarketPrice") or 0)
            pre = float(q.get("preMarketPrice") or 0)
            regular = float(q.get("regularMarketPrice") or 0)
            p, used_session = 0.0, session
            if mkt == "us":
                chosen = _choose_latest_us_quote(
                    now_utc=now_utc,
                    regular_price=regular,
                    regular_ts=q.get("regularMarketTime"),
                    pre_price=pre,
                    pre_ts=q.get("preMarketTime"),
                    post_price=post,
                    post_ts=q.get("postMarketTime"),
                    session=session,
                )
                if chosen:
                    p, used_session = chosen
            elif regular > 0:
                p, used_session = regular, session
            if p > 0:
                for orig in originals:
                    result[orig] = (round(p, 4), used_session)
    return result


# ── Fallback 调度 ───────────────────────────────────────
_SOURCES = [
    ("腾讯财经", _fetch_from_tencent),
    ("新浪财经", _fetch_from_sina),
    ("Yahoo",   _fetch_from_yahoo),
]


def fetch_prices(symbols: list[str], markets: dict[str, str] | None = None) -> PriceResult:
    """多数据源 fallback 获取价格+时段标签，全部失败则抛 RuntimeError
    返回: {symbol: (price, session)} session 为 pre_market/regular/post_market/closed
    """
    if not symbols:
        return {}
    if markets is None:
        markets = {s: "us" for s in symbols}
    has_us_symbol = any(markets.get(s, "us") == "us" for s in symbols)
    sources = _SOURCES
    if has_us_symbol:
        # 美股优先走带时间戳的 Yahoo，再用其他源补缺。
        sources = [
            ("Yahoo", _fetch_from_yahoo),
            ("腾讯财经", _fetch_from_tencent),
            ("新浪财经", _fetch_from_sina),
        ]

    combined: PriceResult = {}
    remaining = list(symbols)
    for name, fn in sources:
        if not remaining:
            break
        try:
            result = fn(remaining, markets)
            if result:
                sessions = set(v[1] for v in result.values())
                logger.info(f"[{name}] 成功获取 {len(result)}/{len(remaining)} 只, 时段: {sessions}")
                combined.update(result)
                remaining = [sym for sym in remaining if sym not in result]
        except Exception as e:
            logger.warning(f"[{name}] 失败: {e}")
    if combined:
        return combined
    raise RuntimeError("所有行情数据源均不可用，请稍后再试")


# ── 数据库批量更新 ──────────────────────────────────────
async def update_all_prices(db: AsyncSession) -> dict[str, float]:
    """更新所有用户的可交易持仓资产价格（供定时任务调用）"""
    stmt = select(Asset).where(
        Asset.category.in_(TRADABLE_CATEGORIES),
        Asset.quantity > 0,
        Asset.is_cash == False,
    )
    rows = await db.execute(stmt)
    assets = rows.scalars().all()
    if not assets:
        return {}

    symbol_map: dict[str, list[int]] = {}
    market_map: dict[str, str] = {}
    for a in assets:
        symbol_map.setdefault(a.symbol, []).append(a.id)
        market_map[a.symbol] = a.market or "us"

    price_data = fetch_prices(list(symbol_map.keys()), market_map)

    updated: dict[str, float] = {}
    for sym, (price, session) in price_data.items():
        for aid in symbol_map.get(sym, []):
            await db.execute(
                update(Asset).where(Asset.id == aid).values(
                    current_price=price, price_session=session
                )
            )
        updated[sym] = price

    if updated:
        await db.commit()
        logger.info(f"定时刷新完成: 更新 {len(updated)} 只股票价格")
    return updated


async def update_all_watchlist_prices(db: AsyncSession) -> dict[str, float]:
    """Refresh cached prices for every private watchlist row.

    Watchlist prices are a convenience cache used by the list and dossier. They
    are refreshed separately from held assets because a candidate can have no
    position yet.
    """
    rows = (await db.execute(select(WatchStock))).scalars().all()
    if not rows:
        return {}
    # Import locally to avoid the market-history -> price-updater dependency
    # becoming a module-import cycle.
    from app.core.market_history import infer_watch_market

    symbol_map = {stock.symbol: stock.id for stock in rows}
    market_map = {stock.symbol: infer_watch_market(stock.symbol, stock.sector) for stock in rows}
    try:
        price_data = fetch_prices(list(symbol_map.keys()), market_map)
    except RuntimeError:
        return {}
    updated: dict[str, float] = {}
    for symbol, (price, session) in price_data.items():
        stock_id = symbol_map.get(symbol)
        if stock_id is None:
            continue
        await db.execute(
            update(WatchStock).where(WatchStock.id == stock_id).values(
                current_price=price,
                price_session=session,
                price_change=None,
                price_change_pct=None,
            )
        )
        updated[symbol] = price
    if updated:
        await db.commit()
    return updated
