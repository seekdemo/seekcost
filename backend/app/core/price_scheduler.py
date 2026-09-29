"""后台定时任务 — 每小时自动刷新所有持仓资产价格"""
import asyncio
import logging
from app.core.database import async_session
from app.core.price_updater import update_all_prices, update_all_watchlist_prices
from app.core.price_anchor_monitor import scan_due_price_anchor_stocks
from app.core.volume_watch import scan_due_volume_watch_stocks

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 3600  # 1 小时

_task: asyncio.Task | None = None


async def _tick():
    """单次刷新"""
    try:
        async with async_session() as db:
            updated = await update_all_prices(db)
            if updated:
                logger.info(f"[定时刷新] 完成，更新: {list(updated.keys())}")
            else:
                logger.info("[定时刷新] 无需更新（无持仓）")
            watchlist_updated = await update_all_watchlist_prices(db)
            if watchlist_updated:
                logger.info("[股票池定时刷新] 更新 %s 只标的", len(watchlist_updated))
            report = await scan_due_price_anchor_stocks(db)
            if report.scanned or report.errors:
                logger.info(
                    "[价格锚点监控] 扫描 %s 个标的，失败 %s 个",
                    report.scanned,
                    report.errors,
                )
            volume_report = await scan_due_volume_watch_stocks(db)
            if volume_report.scanned or volume_report.errors:
                logger.info(
                    "[放量观察] 扫描 %s 个标的，失败 %s 个",
                    volume_report.scanned,
                    volume_report.errors,
                )
    except Exception as e:
        logger.error(f"[定时刷新] 失败: {e}")


async def _loop():
    """循环调度"""
    # 启动后先等 30 秒再首次刷新，避免启动时争抢资源
    await asyncio.sleep(30)
    while True:
        await _tick()
        await asyncio.sleep(INTERVAL_SECONDS)


def start():
    """启动定时任务（在 app lifespan 中调用）"""
    global _task
    if _task is None or _task.done():
        _task = asyncio.create_task(_loop())
        logger.info(f"[定时刷新] 已启动，间隔 {INTERVAL_SECONDS}s")


def stop():
    """停止定时任务"""
    global _task
    if _task and not _task.done():
        _task.cancel()
        logger.info("[定时刷新] 已停止")
