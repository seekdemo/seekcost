"""博弈仪表盘 API"""
import asyncio
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset, AssetZone
from app.models.harbor import Harbor
from app.models.liability import Liability
from app.models.ibkr_cash_flow import IBKRCashFlowRecord
from app.schemas.dashboard import DashboardResponse, AssetSummary, InvestSummary, HarborStatus
from app.core.exchange_rate import async_get_all_rates_to_cny, get_currency_for_market

router = APIRouter(prefix="/dashboard", tags=["博弈仪表盘"])


def _build_invest_summary(asset: Asset) -> InvestSummary:
    invested = float(asset.total_invested)
    cashed = float(asset.total_cashed)
    return InvestSummary(
        id=asset.id,
        symbol=asset.symbol, name=asset.name,
        category=asset.category.value,
        market=asset.market or "other",
        total_invested=invested,
        total_cashed=cashed,
        return_rate=min(cashed / invested, 1.0) if invested > 0 else 0.0,
    )


def _build_summary(asset: Asset) -> AssetSummary:
    qty = float(asset.quantity)
    cur = float(asset.current_price)
    mc = float(asset.mental_cost)
    bc = float(asset.broker_cost)
    invested = float(asset.total_invested)
    cashed = float(asset.total_cashed)
    progress = cashed / invested if invested > 0 else 0.0
    return AssetSummary(
        id=asset.id,
        symbol=asset.symbol, name=asset.name, zone=asset.zone.value,
        market=asset.market or "other",
        mental_cost=mc, broker_cost=bc, current_price=cur, price_session=asset.price_session or "", quantity=qty,
        mental_pnl=(cur - mc) * qty if cur > 0 else 0,
        broker_pnl=(cur - bc) * qty if cur > 0 else 0,
        zero_cost_progress=min(progress, 1.0),
    )


@router.get("", response_model=DashboardResponse)
@router.get("/", response_model=DashboardResponse, include_in_schema=False)
async def get_dashboard(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # 并行：查资产 + 查避风港 + 查负债 + 获取汇率
    assets_q = db.execute(select(Asset).where(Asset.user_id == user.id))
    harbor_q = db.execute(select(Harbor).where(Harbor.user_id == user.id))
    liab_q = db.execute(select(Liability).where(Liability.user_id == user.id))
    ibkr_cash_flow_q = db.execute(select(IBKRCashFlowRecord).where(IBKRCashFlowRecord.user_id == user.id))
    rates_q = async_get_all_rates_to_cny()

    assets_r, harbor_r, liab_r, ibkr_cash_flow_r, rates = await asyncio.gather(
        assets_q, harbor_q, liab_q, ibkr_cash_flow_q, rates_q
    )

    assets = assets_r.scalars().all()
    harbor = harbor_r.scalars().first()
    liabilities = liab_r.scalars().all()
    ibkr_cash_flows = ibkr_cash_flow_r.scalars().all()

    active = [a for a in assets if a.zone == AssetZone.ACTIVE]
    base = [a for a in assets if a.zone == AssetZone.BASE]
    invest = [a for a in assets if a.zone == AssetZone.INVEST]

    # 净值只算交易型资产（排除能力投资），统一换算为 CNY
    tradable = [a for a in assets if a.zone != AssetZone.INVEST]
    mental_nw = 0.0
    holding_cost_cny = 0.0
    market_value_cny = 0.0
    total_realized_pnl_cny = 0.0
    unrealized_pnl_cny = 0.0
    # 旧字段保留向后兼容
    total_recovered_cny = 0.0
    total_cashed_cny = 0.0
    total_invested_cny = 0.0
    for a in tradable:
        market = a.market or "other"
        currency = get_currency_for_market(market)
        rate = rates.get(currency, 1.0)
        qty = float(a.quantity)
        cp = float(a.current_price)
        bc = float(a.broker_cost)
        mv = cp * qty * rate if cp > 0 else 0
        mental_nw += mv
        market_value_cny += mv
        # 持仓成本 = 成本价 × 持仓数量
        if qty > 0 and bc > 0:
            holding_cost_cny += bc * qty * rate
        total_realized_pnl_cny += float(a.total_realized_pnl) * rate
        # 未实现浮盈 = (现价 - 成本) * 持仓数量
        if qty > 0 and cp > 0 and bc > 0:
            unrealized_pnl_cny += (cp - bc) * qty * rate
        # 旧字段
        total_recovered_cny += float(a.total_recovered) * rate
        total_cashed_cny += float(a.total_cashed) * rate
        total_invested_cny += float(a.total_invested) * rate

    ibkr_deposits_cny = 0.0
    ibkr_withdrawals_cny = 0.0
    for flow in ibkr_cash_flows:
        amount = float(flow.amount)
        rate = rates.get((flow.currency or "CNY").upper(), 1.0)
        amount_cny = amount * rate
        if amount_cny >= 0:
            ibkr_deposits_cny += amount_cny
        else:
            ibkr_withdrawals_cny += abs(amount_cny)
    ibkr_net_deposit_cny = ibkr_deposits_cny - ibkr_withdrawals_cny

    broker_nw = mental_nw
    total_pnl_cny = total_realized_pnl_cny + unrealized_pnl_cny
    # 旧字段：total_assets = 市值（不再加回收本金，避免重复）
    total_assets_cny = mental_nw

    harbor_status = HarborStatus(
        balance=float(harbor.balance) if harbor else 0,
        total_in=float(harbor.total_in) if harbor else 0,
        total_out=float(harbor.total_out) if harbor else 0,
    )

    total_liability = sum(float(li.remaining_amount) for li in liabilities)

    harbor_bal = float(harbor.balance) if harbor else 0
    zero_count = sum(1 for a in assets if a.is_zero_cost)
    liability_ratio = total_liability / mental_nw if mental_nw > 0 else 1.0
    harbor_ratio = harbor_bal / mental_nw if mental_nw > 0 else 0
    safety = min(100, (
        harbor_ratio * 40
        + (zero_count / max(len(assets), 1)) * 40
        + (1 - min(liability_ratio, 1)) * 20
    ))

    # 用户默认货币
    default_currency = user.default_currency if hasattr(user, 'default_currency') else "CNY"

    return DashboardResponse(
        mental_net_worth=round(mental_nw, 2),
        broker_net_worth=round(broker_nw, 2),
        total_invested_cny=round(total_invested_cny, 2),
        holding_cost_cny=round(holding_cost_cny, 2),
        market_value_cny=round(market_value_cny, 2),
        stock_invested_cny=0.0,
        ibkr_deposits_cny=round(ibkr_deposits_cny, 2),
        ibkr_withdrawals_cny=round(ibkr_withdrawals_cny, 2),
        ibkr_net_deposit_cny=round(ibkr_net_deposit_cny, 2),
        total_realized_pnl_cny=round(total_realized_pnl_cny, 2),
        unrealized_pnl_cny=round(unrealized_pnl_cny, 2),
        total_pnl_cny=round(total_pnl_cny, 2),
        total_recovered_cny=round(total_recovered_cny, 2),
        total_assets_cny=round(total_assets_cny, 2),
        total_cashed_cny=round(total_cashed_cny, 2),
        default_currency=default_currency,
        harbor=harbor_status,
        active_assets=[_build_summary(a) for a in active],
        base_assets=[_build_summary(a) for a in base],
        invest_assets=[_build_invest_summary(a) for a in invest],
        safety_score=round(safety, 1),
        zero_cost_count=zero_count,
        exchange_rates=rates,
    )
