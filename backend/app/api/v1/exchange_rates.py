"""汇率 API — 获取实时汇率"""
import asyncio
from fastapi import APIRouter, Depends
from app.core.security import get_current_user
from app.models.user import User
from app.core.exchange_rate import get_all_rates_to_cny, get_exchange_rate, clear_cache

router = APIRouter(prefix="/exchange-rates", tags=["汇率"])


@router.get("")
@router.get("/", include_in_schema=False)
async def get_rates(user: User = Depends(get_current_user)):
    """获取所有常用货币兑 CNY 的汇率"""
    rates = await asyncio.to_thread(get_all_rates_to_cny)
    return {"base": "CNY", "rates": rates}


@router.get("/convert")
async def convert_currency(
    amount: float,
    from_cur: str = "USD",
    to_cur: str = "CNY",
    user: User = Depends(get_current_user),
):
    """货币转换"""
    rate = await asyncio.to_thread(get_exchange_rate, from_cur.upper(), to_cur.upper())
    converted = round(amount * rate, 2)
    return {
        "amount": amount,
        "from": from_cur.upper(),
        "to": to_cur.upper(),
        "rate": rate,
        "converted": converted,
    }


@router.post("/refresh")
async def refresh_rates(user: User = Depends(get_current_user)):
    """强制刷新汇率缓存"""
    await asyncio.to_thread(clear_cache)
    rates = await asyncio.to_thread(get_all_rates_to_cny)
    return {"message": "汇率已刷新", "rates": rates}