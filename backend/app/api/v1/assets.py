"""资产 CRUD API — 用户隔离"""
from fastapi import APIRouter, Depends, HTTPException, Body
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset, AssetZone, detect_market
from app.models.transaction import Transaction
from app.models.trade_plan import TradePlan
from app.models.tag import Tag
from app.models.ibkr_lot import IBKRLotRecord
from app.schemas.asset import AssetCreate, AssetUpdate, AssetOut, AssetDetail, TransactionDetail, ProfitAllocationOut, SellBatchItemDetail, IBKRLotOut

router = APIRouter(prefix="/assets", tags=["资产管理"])


@router.get("", response_model=list[AssetOut])
@router.get("/", response_model=list[AssetOut], include_in_schema=False)
async def list_assets(
    zone: AssetZone | None = None,
    include_archived: bool = False,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(Asset).where(Asset.user_id == user.id).options(selectinload(Asset.tags))
    if not include_archived:
        stmt = stmt.where(Asset.archived == False)
    if zone:
        stmt = stmt.where(Asset.zone == zone)
    stmt = stmt.order_by(desc(Asset.pinned), Asset.sort_order, Asset.created_at)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=AssetOut, status_code=201)
@router.post("/", response_model=AssetOut, status_code=201, include_in_schema=False)
async def create_asset(body: AssetCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    data = body.model_dump()
    # 自动推断市场
    if not data.get("market"):
        data["market"] = detect_market(data["symbol"], data["category"])
    asset = Asset(
        user_id=user.id,
        **data,
        total_cashed=0,
        total_realized_pnl=0,
        is_zero_cost=False,
    )
    db.add(asset)
    await db.commit()
    await db.refresh(asset)
    await db.refresh(asset, ["tags"])
    return asset


@router.get("/{asset_id}", response_model=AssetDetail)
async def get_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result_asset = await db.execute(
        select(Asset).where(Asset.id == asset_id).options(selectinload(Asset.tags))
    )
    asset = result_asset.scalars().first()
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")

    # 查询交易记录计算实际投入
    stmt = (
        select(Transaction)
        .where(Transaction.asset_id == asset_id)
        .options(selectinload(Transaction.profit_allocations), selectinload(Transaction.batch_items))
        .order_by(Transaction.created_at.desc())
    )
    result = await db.execute(stmt)
    txs = result.scalars().all()

    qty = float(asset.quantity)
    price = float(asset.current_price)
    broker = float(asset.broker_cost)
    mental = float(asset.mental_cost)
    invested = float(asset.total_invested)
    planned = float(asset.planned_investment)

    market_value = qty * price if price > 0 else 0
    broker_pnl = (price - broker) * qty if qty > 0 and price > 0 else 0
    mental_pnl = (price - mental) * qty if qty > 0 and price > 0 else 0
    total_realized = float(asset.total_realized_pnl)
    zero_cost_progress = min(float(asset.total_cashed) / invested, 1.0) if invested > 0 else 0

    # 计算实际投入金额（基于买入交易）
    buy_transactions = [t for t in txs if t.tx_type.value == "buy"]
    calculated_investment = sum(
        float(t.price) * float(t.quantity) + float(t.fee)
        for t in buy_transactions
    )
    
    # 更新资产的实际投入金额。现金资产余额来自券商现金报告，不由买入交易推导。
    if not asset.is_cash and abs(float(asset.actual_investment) - calculated_investment) > 0.01:
        asset.actual_investment = calculated_investment
        await db.commit()
        await db.refresh(asset)
        await db.refresh(asset, ["tags"])

    # 查询交易计划
    plan_stmt = select(TradePlan).where(TradePlan.asset_id == asset_id).order_by(TradePlan.created_at.desc())
    plan_result = await db.execute(plan_stmt)
    plans = plan_result.scalars().all()

    # 查询 IBKR 持仓批次
    lot_stmt = select(IBKRLotRecord).where(IBKRLotRecord.asset_id == asset_id).order_by(IBKRLotRecord.open_datetime.desc())
    lot_result = await db.execute(lot_stmt)
    ibkr_lots = [IBKRLotOut.model_validate(lot) for lot in lot_result.scalars().all()]

    tx_details = []
    for t in txs:
        allocs = [
            ProfitAllocationOut(
                id=a.id,
                allocation_type=a.allocation_type.value,
                amount=float(a.amount),
                target_asset_id=a.target_asset_id,
                created_at=a.created_at,
            )
            for a in t.profit_allocations
        ]
        bi_list = [
            SellBatchItemDetail(id=bi.id, buy_tx_id=bi.buy_tx_id, quantity=float(bi.quantity))
            for bi in t.batch_items
        ]
        tx_details.append(TransactionDetail(
            id=t.id,
            tx_type=t.tx_type.value,
            price=float(t.price),
            quantity=float(t.quantity),
            fee=float(t.fee),
            realized_profit=float(t.realized_profit),
            sold_quantity=float(t.sold_quantity),
            status=t.status.value,
            source_tx_id=t.source_tx_id,
            note=t.note,
            created_at=t.created_at,
            allocations=allocs,
            batch_items=bi_list,
        ))

    return AssetDetail(
        id=asset.id,
        symbol=asset.symbol,
        name=asset.name,
        zone=asset.zone,
        category=asset.category,
        market=asset.market or "other",
        broker_cost=broker,
        mental_cost=mental,
        quantity=qty,
        current_price=price,
        total_invested=invested,
        total_cashed=float(asset.total_cashed),
        total_realized_pnl=total_realized,
        total_recovered=float(asset.total_recovered),
        is_zero_cost=asset.is_zero_cost,
        planned_investment=planned,
        actual_investment=float(asset.actual_investment),
        planned_includes_invested=asset.planned_includes_invested,
        is_cash=asset.is_cash,
        sort_order=asset.sort_order,
        pinned=asset.pinned,
        archived=asset.archived,
        archived_note=asset.archived_note,
        created_at=asset.created_at,
        updated_at=asset.updated_at,
        market_value=market_value,
        broker_pnl=broker_pnl,
        mental_pnl=mental_pnl,
        total_realized=total_realized,
        zero_cost_progress=zero_cost_progress,
        investment_summary={
            "planned_investment": planned,
            "actual_investment": float(asset.actual_investment),
            "calculated_investment": calculated_investment,
            "planned_includes_invested": asset.planned_includes_invested,
            "effective_total": planned if asset.planned_includes_invested else planned + calculated_investment,
            "remaining_to_invest": max(0, planned - calculated_investment) if asset.planned_includes_invested else planned,
            "investment_progress": min(calculated_investment / planned, 1.0) if planned > 0 and asset.planned_includes_invested else (min(calculated_investment / (planned + calculated_investment), 1.0) if (planned + calculated_investment) > 0 else 0)
        },
        transactions=tx_details,
        trade_plans=plans,
        tags=asset.tags,
        ibkr_lots=ibkr_lots,
    )


@router.patch("/{asset_id}", response_model=AssetOut)
async def update_asset(asset_id: int, body: AssetUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(asset, field, value)
    # symbol 或 category 变更时重新推断 market
    if "symbol" in updates or "category" in updates:
        asset.market = detect_market(asset.symbol, asset.category.value if hasattr(asset.category, 'value') else asset.category)
    await db.commit()
    await db.refresh(asset)
    await db.refresh(asset, ["tags"])
    return asset


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(asset_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(Asset)
        .where(Asset.id == asset_id)
        .options(
            selectinload(Asset.transactions),
            selectinload(Asset.trade_plans),
        )
    )
    asset = result.scalars().first()
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    await db.delete(asset)
    await db.commit()


@router.post("/{asset_id}/archive", response_model=AssetOut)
async def archive_asset(
    asset_id: int,
    note: str | None = Body(None, embed=True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """归档资产（清仓/不再关注）— 保留历史数据"""
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    asset.archived = True
    asset.archived_note = note
    asset.pinned = False
    await db.commit()
    await db.refresh(asset)
    await db.refresh(asset, ["tags"])
    return asset


@router.post("/{asset_id}/unarchive", response_model=AssetOut)
async def unarchive_asset(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """恢复已归档资产"""
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    asset.archived = False
    asset.archived_note = None
    await db.commit()
    await db.refresh(asset)
    await db.refresh(asset, ["tags"])
    return asset


# ---- 批量排序 ----
class ReorderItem(BaseModel):
    id: int
    sort_order: int

class ReorderBody(BaseModel):
    items: list[ReorderItem]


@router.post("/reorder", status_code=200)
async def reorder_assets(body: ReorderBody, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """批量更新资产排序序号"""
    for item in body.items:
        asset = await db.get(Asset, item.id)
        if asset and asset.user_id == user.id:
            asset.sort_order = item.sort_order
    await db.commit()
    return {"message": "ok"}


# ---- 资金规划功能 ----

@router.patch("/{asset_id}/planned-investment", response_model=AssetOut)
async def update_planned_investment(
    asset_id: int,
    planned_amount: float = Body(..., embed=True),
    includes_invested: bool = Body(True, embed=True),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """更新资产的预计投入金额"""
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    
    asset.planned_investment = planned_amount
    asset.planned_includes_invested = includes_invested
    await db.commit()
    await db.refresh(asset)
    await db.refresh(asset, ["tags"])
    return asset


@router.get("/{asset_id}/investment-summary")
async def get_investment_summary(
    asset_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """获取资产投资摘要"""
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")
    
    # 计算实际投入金额（基于交易记录）
    stmt = select(Transaction).where(
        Transaction.asset_id == asset_id,
        Transaction.tx_type == "BUY"
    )
    result = await db.execute(stmt)
    transactions = result.scalars().all()
    
    total_buy_amount = sum(float(tx.price) * float(tx.quantity) + float(tx.fee) for tx in transactions)
    
    return {
        "asset_id": asset.id,
        "symbol": asset.symbol,
        "name": asset.name,
        "planned_investment": float(asset.planned_investment),
        "actual_investment": float(asset.actual_investment),
        "calculated_investment": total_buy_amount,
        "remaining_to_invest": max(0, float(asset.planned_investment) - total_buy_amount)
    }
