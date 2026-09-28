"""
汇率服务 — 异步并发获取实时汇率，带内存缓存
"""
import asyncio
import logging
import time
import httpx

logger = logging.getLogger(__name__)

_TIMEOUT = 5  # 单次请求超时 5 秒
_CACHE_TTL = 3600  # 1 小时缓存

# 内存缓存: { "USD_CNY": (rate, timestamp) }
_cache: dict[str, tuple[float, float]] = {}

# 默认汇率（API 不可用时的 fallback）
DEFAULT_RATES: dict[str, float] = {
    "USD_CNY": 7.24,
    "HKD_CNY": 0.93,
    "EUR_CNY": 7.90,
    "GBP_CNY": 9.15,
    "JPY_CNY": 0.048,
    "CNY_CNY": 1.0,
}

MARKET_CURRENCY: dict[str, str] = {
    "us": "USD",
    "cn": "CNY",
    "hk": "HKD",
    "crypto": "USD",
    "other": "CNY",
}


def get_currency_for_market(market: str) -> str:
    return MARKET_CURRENCY.get(market, "CNY")


def _get_cached(from_cur: str, to_cur: str) -> float | None:
    """检查缓存是否命中"""
    cache_key = f"{from_cur}_{to_cur}"
    if cache_key in _cache:
        rate, ts = _cache[cache_key]
        if time.time() - ts < _CACHE_TTL:
            return rate
    return None


def _set_cached(from_cur: str, to_cur: str, rate: float):
    _cache[f"{from_cur}_{to_cur}"] = (rate, time.time())


def _get_default(from_cur: str, to_cur: str) -> float:
    """获取默认/反向默认汇率"""
    key = f"{from_cur}_{to_cur}"
    if key in DEFAULT_RATES:
        return DEFAULT_RATES[key]
    rkey = f"{to_cur}_{from_cur}"
    if rkey in DEFAULT_RATES:
        return round(1.0 / DEFAULT_RATES[rkey], 6)
    return 1.0


async def _fetch_rate_async(client: httpx.AsyncClient, from_cur: str, to_cur: str) -> float | None:
    """异步获取单个汇率"""
    try:
        url = f"https://open.er-api.com/v6/latest/{from_cur}"
        resp = await client.get(url)
        resp.raise_for_status()
        data = resp.json()
        if data.get("result") == "success":
            rate = data.get("rates", {}).get(to_cur)
            if rate and rate > 0:
                return round(float(rate), 6)
    except Exception as e:
        logger.warning(f"[汇率] 异步获取 {from_cur}/{to_cur} 失败: {e}")
    return None


# ── 同步接口（兼容旧调用） ──

def get_exchange_rate(from_cur: str, to_cur: str) -> float:
    """同步获取汇率（优先缓存，未命中用默认值）"""
    if from_cur == to_cur:
        return 1.0
    cached = _get_cached(from_cur, to_cur)
    if cached is not None:
        return cached
    # 同步场景不阻塞网络，直接用默认值
    return _get_default(from_cur, to_cur)


def get_all_rates_to_cny() -> dict[str, float]:
    """同步获取所有汇率（优先缓存，回退默认值，不阻塞）"""
    currencies = ["USD", "HKD", "EUR", "GBP", "JPY"]
    rates: dict[str, float] = {"CNY": 1.0}
    for cur in currencies:
        rates[cur] = get_exchange_rate(cur, "CNY")
    return rates


# ── 异步接口（推荐使用） ──

async def async_get_all_rates_to_cny() -> dict[str, float]:
    """异步并发获取所有汇率 — dashboard 推荐用这个"""
    currencies = ["USD", "HKD", "EUR", "GBP", "JPY"]
    rates: dict[str, float] = {"CNY": 1.0}

    # 先用缓存填充，收集需要刷新的
    need_fetch: list[str] = []
    for cur in currencies:
        cached = _get_cached(cur, "CNY")
        if cached is not None:
            rates[cur] = cached
        else:
            need_fetch.append(cur)

    if not need_fetch:
        return rates

    # 并发请求未缓存的汇率，总超时 5 秒
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT) as client:
            tasks = [_fetch_rate_async(client, cur, "CNY") for cur in need_fetch]
            results = await asyncio.wait_for(asyncio.gather(*tasks, return_exceptions=True), timeout=6)
            for cur, result in zip(need_fetch, results):
                if isinstance(result, (float, int)) and result > 0:
                    rates[cur] = result
                    _set_cached(cur, "CNY", result)
                else:
                    rates[cur] = _get_default(cur, "CNY")
    except (asyncio.TimeoutError, Exception) as e:
        logger.warning(f"[汇率] 批量获取超时/失败: {e}，使用默认值")
        for cur in need_fetch:
            if cur not in rates:
                rates[cur] = _get_default(cur, "CNY")

    return rates


async def warm_up_cache():
    """启动时预热汇率缓存"""
    logger.info("[汇率] 预热缓存...")
    await async_get_all_rates_to_cny()
    logger.info("[汇率] 缓存预热完成")


def clear_cache():
    _cache.clear()
    logger.info("[汇率] 缓存已清除")