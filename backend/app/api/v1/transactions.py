"""交易记录 & 博弈引擎 — 利润流转 API（加权平均成本）"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset
from app.models.transaction import Transaction, TransactionType, TxStatus
from app.models.profit_allocation import ProfitAllocation, AllocationType
from app.models.sell_batch_item import SellBatchItem
from app.models.harbor import Harbor
from app.schemas.transaction import TransactionCreate, TransactionUpdate, TransactionOut
from app.core.recalc import recalc_asset

router = APIRouter(prefix="/transactions", tags=["交易 & 博弈引擎"])


@router.get("", response_model=list[TransactionOut])
@router.get("/", response_model=list[TransactionOut], include_in_schema=False)
async def list_transactions(asset_id: int | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(Transaction).join(Asset).where(Asset.user_id == user.id).options(selectinload(Transaction.batch_items)).order_by(Transaction.created_at.desc())
    if asset_id:
        stmt = stmt.where(Transaction.asset_id == asset_id)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TransactionOut, status_code=201)
@router.post("/", response_model=TransactionOut, status_code=201, include_in_schema=False)
async def create_transaction(body: TransactionCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    asset = await db.get(Asset, body.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="资产不存在")

    old_qty = float(asset.quantity)
    old_broker = float(asset.broker_cost)
    old_mental = float(asset.mental_cost)
    realized_profit = 0.0

    # ============================================================
    # 成本引擎：加权平均法
    # broker_cost = 券商真实成本（严格加权平均，卖出不变）
    # mental_cost = 心理成本（独立轨道，买入加权，利润分配可冲抵）
    # ============================================================
    if body.tx_type == TransactionType.BUY:
        new_qty = old_qty + body.quantity
        # 加权平均：(旧成本*旧数量 + (新价*新数量+手续费)) / 总数量
        buy_cost = body.price * body.quantity + body.fee
        asset.broker_cost = (old_broker * old_qty + buy_cost) / new_qty
        asset.mental_cost = (old_mental * old_qty + buy_cost) / new_qty
        asset.quantity = new_qty
        asset.total_invested = float(asset.total_invested) + buy_cost

    elif body.tx_type in (TransactionType.SELL, TransactionType.T_TRADE):
        if body.quantity > old_qty:
            raise HTTPException(status_code=400, detail=f"卖出数量({body.quantity})超过持仓({old_qty})")

        # 利润计算：有批次分配时按批次成本加权，否则用整体加权平均成本
        if body.batch_items and len(body.batch_items) > 0:
            # 校验批次分配总量 = 卖出总量
            alloc_qty = sum(bi.quantity for bi in body.batch_items)
            if abs(alloc_qty - body.quantity) > 0.0001:
                raise HTTPException(status_code=400, detail=f"批次分配总量({alloc_qty})与卖出数量({body.quantity})不一致")
            # 按每个批次的成本计算加权利润
            realized_profit = 0.0
            for bi in body.batch_items:
                src = await db.get(Transaction, bi.buy_tx_id)
                if not src or src.asset_id != body.asset_id or src.tx_type != TransactionType.BUY:
                    raise HTTPException(status_code=400, detail=f"买入批次({bi.buy_tx_id})无效")
                remaining = float(src.quantity) - float(src.sold_quantity)
                if bi.quantity > remaining + 0.0001:
                    raise HTTPException(status_code=400, detail=f"批次#{bi.buy_tx_id}可卖{remaining}，但指定了{bi.quantity}")
                batch_cost = float(src.price) + float(src.fee) / float(src.quantity)
                realized_profit += (body.price - batch_cost) * bi.quantity
            realized_profit -= body.fee  # 卖出手续费统一扣减
        else:
            realized_profit = (body.price - old_broker) * body.quantity - body.fee

        new_qty = old_qty - body.quantity
        asset.quantity = new_qty
        if new_qty == 0:
            asset.broker_cost = 0
            asset.mental_cost = 0

        # 只记录正利润到已套现
        if realized_profit > 0:
            asset.total_cashed = float(asset.total_cashed) + realized_profit

        # 零成本检测
        if float(asset.total_invested) > 0 and float(asset.total_cashed) >= float(asset.total_invested):
            asset.is_zero_cost = True

    # 创建交易记录
    tx = Transaction(
        asset_id=body.asset_id,
        tx_type=body.tx_type,
        price=body.price,
        quantity=body.quantity,
        fee=body.fee,
        realized_profit=realized_profit,
        note=body.note,
    )
    db.add(tx)
    await db.flush()

    # ---- 保存批次分配并更新买入批次的卖出追踪 ----
    if body.batch_items and body.tx_type in (TransactionType.SELL, TransactionType.T_TRADE):
        for bi in body.batch_items:
            sbi = SellBatchItem(sell_tx_id=tx.id, buy_tx_id=bi.buy_tx_id, quantity=bi.quantity)
            db.add(sbi)
            src = await db.get(Transaction, bi.buy_tx_id)
            if src:
                src.sold_quantity = float(src.sold_quantity) + bi.quantity
                remaining = float(src.quantity) - float(src.sold_quantity)
                src.status = TxStatus.CLEARED if remaining <= 0 else TxStatus.PARTIAL_SOLD

    # ============================================================
    # 博弈引擎：利润分配（仅卖出且有正利润时）
    # ============================================================
    if body.allocations and realized_profit > 0:
        alloc_total = sum(a.amount for a in body.allocations)
        if alloc_total > realized_profit:
            raise HTTPException(status_code=400, detail=f"分配总额({alloc_total})超过可分配利润({realized_profit:.2f})")

        for alloc in body.allocations:
            pa = ProfitAllocation(
                transaction_id=tx.id,
                allocation_type=alloc.allocation_type,
                amount=alloc.amount,
                target_asset_id=alloc.target_asset_id,
            )
            db.add(pa)

            if alloc.allocation_type == AllocationType.SELF_OFFSET:
                # 原位摊薄：降低本资产心理成本
                cur_qty = float(asset.quantity)
                if cur_qty > 0:
                    asset.mental_cost = float(asset.mental_cost) - alloc.amount / cur_qty

            elif alloc.allocation_type == AllocationType.CROSS_SAVE and alloc.target_asset_id:
                # 跨标的拯救：降低目标资产心理成本
                target = await db.get(Asset, alloc.target_asset_id)
                if not target or target.user_id != user.id:
                    raise HTTPException(status_code=404, detail=f"目标资产({alloc.target_asset_id})不存在")
                tgt_qty = float(target.quantity)
                if tgt_qty > 0:
                    target.mental_cost = float(target.mental_cost) - alloc.amount / tgt_qty

            elif alloc.allocation_type == AllocationType.TO_HARBOR:
                # 转入避风港
                harbor = (await db.execute(select(Harbor).where(Harbor.user_id == user.id))).scalars().first()
                if not harbor:
                    harbor = Harbor(user_id=user.id, balance=0, total_in=0, total_out=0)
                    db.add(harbor)
                harbor.balance = float(harbor.balance) + alloc.amount
                harbor.total_in = float(harbor.total_in) + alloc.amount

    await db.flush()
    await recalc_asset(asset.id, user.id, db)
    await db.commit()

    # 重新加载完整对象（含关系）
    from sqlalchemy.orm import selectinload as _sel
    result = await db.execute(
        select(Transaction)
        .where(Transaction.id == tx.id)
        .options(_sel(Transaction.batch_items), _sel(Transaction.profit_allocations))
    )
    tx = result.scalar_one()
    return tx


@router.put("/{tx_id}", response_model=TransactionOut)
@router.put("/{tx_id}/", response_model=TransactionOut, include_in_schema=False)
async def update_transaction(tx_id: int, body: TransactionUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """修改交易记录，自动重算资产所有指标"""
    tx = await db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="交易记录不存在")
    asset = await db.get(Asset, tx.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="交易记录不存在")

    # 更新基本字段（price/quantity/fee/note）
    for field, value in body.model_dump(exclude_unset=True, exclude={"allocations", "batch_items"}).items():
        setattr(tx, field, value)

    # 如果传了 batch_items，替换该交易的全部批次分配
    if body.batch_items is not None:
        # 删除旧的批次分配，恢复买入批次的 sold_quantity
        old_sbis = (await db.execute(
            select(SellBatchItem).where(SellBatchItem.sell_tx_id == tx.id)
        )).scalars().all()
        for old_sbi in old_sbis:
            src = await db.get(Transaction, old_sbi.buy_tx_id)
            if src:
                src.sold_quantity = max(float(src.sold_quantity) - float(old_sbi.quantity), 0)
                remaining = float(src.quantity) - float(src.sold_quantity)
                if remaining >= float(src.quantity) - 0.0001:
                    src.status = TxStatus.HOLDING
                else:
                    src.status = TxStatus.PARTIAL_SOLD
            await db.delete(old_sbi)

        # 创建新的批次分配
        for bi in body.batch_items:
            src = await db.get(Transaction, bi.buy_tx_id)
            if not src or src.asset_id != tx.asset_id or src.tx_type != TransactionType.BUY:
                raise HTTPException(status_code=400, detail=f"买入批次({bi.buy_tx_id})无效")
            remaining = float(src.quantity) - float(src.sold_quantity)
            if bi.quantity > remaining + 0.0001:
                raise HTTPException(status_code=400, detail=f"批次#{bi.buy_tx_id}可卖{remaining:.4f}，但指定了{bi.quantity:.4f}")
            sbi = SellBatchItem(sell_tx_id=tx.id, buy_tx_id=bi.buy_tx_id, quantity=bi.quantity)
            db.add(sbi)
            src.sold_quantity = float(src.sold_quantity) + bi.quantity
            new_remaining = float(src.quantity) - float(src.sold_quantity)
            src.status = TxStatus.CLEARED if new_remaining <= 0.0001 else TxStatus.PARTIAL_SOLD

        await db.flush()

    # 如果传了 allocations，替换该交易的全部利润分配
    if body.allocations is not None:
        # 先撤销旧的利润分配影响
        old_allocs = (await db.execute(
            select(ProfitAllocation).where(ProfitAllocation.transaction_id == tx.id)
        )).scalars().all()
        for oa in old_allocs:
            # 撤销 to_harbor
            if oa.allocation_type == AllocationType.TO_HARBOR:
                harbor = (await db.execute(
                    select(Harbor).where(Harbor.user_id == user.id)
                )).scalar_one_or_none()
                if harbor:
                    harbor.balance = max(float(harbor.balance) - float(oa.amount), 0)
                    harbor.total_in = max(float(harbor.total_in) - float(oa.amount), 0)
            # 撤销 cross_save（目标资产的 mental_cost 会在 recalc 中重算）
            await db.delete(oa)

        # 创建新的利润分配
        for alloc_in in body.allocations:
            alloc = ProfitAllocation(
                transaction_id=tx.id,
                allocation_type=alloc_in.allocation_type,
                amount=alloc_in.amount,
                target_asset_id=alloc_in.target_asset_id,
            )
            db.add(alloc)

            if alloc_in.allocation_type == AllocationType.TO_HARBOR:
                harbor = (await db.execute(
                    select(Harbor).where(Harbor.user_id == user.id)
                )).scalar_one_or_none()
                if not harbor:
                    harbor = Harbor(user_id=user.id, balance=0, total_in=0)
                    db.add(harbor)
                    await db.flush()
                harbor.balance = float(harbor.balance) + alloc_in.amount
                harbor.total_in = float(harbor.total_in) + alloc_in.amount

        await db.flush()

    # 重算该资产全部指标
    await recalc_asset(asset.id, user.id, db)

    # 如果有 cross_save，也重算目标资产
    if body.allocations:
        target_ids = {a.target_asset_id for a in body.allocations if a.allocation_type == AllocationType.CROSS_SAVE and a.target_asset_id}
        for tid in target_ids:
            await recalc_asset(tid, user.id, db)

    await db.commit()

    # 重新加载完整对象（含关系）
    from sqlalchemy.orm import selectinload as _sel
    result = await db.execute(
        select(Transaction)
        .where(Transaction.id == tx.id)
        .options(_sel(Transaction.batch_items), _sel(Transaction.profit_allocations))
    )
    tx = result.scalar_one()
    return tx


@router.delete("/{tx_id}", status_code=204)
@router.delete("/{tx_id}/", status_code=204, include_in_schema=False)
async def delete_transaction(tx_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """删除交易记录，自动重算资产所有指标"""
    from sqlalchemy.orm import selectinload as _sel
    tx = await db.get(Transaction, tx_id)
    if not tx:
        raise HTTPException(status_code=404, detail="交易记录不存在")
    asset = await db.get(Asset, tx.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(status_code=404, detail="交易记录不存在")

    asset_id = tx.asset_id
    user_id = user.id

    # 先删除该交易关联的利润分配记录
    stmt = select(ProfitAllocation).where(ProfitAllocation.transaction_id == tx_id)
    result = await db.execute(stmt)
    for alloc in result.scalars().all():
        await db.delete(alloc)

    # 删除关联的批次分配记录
    stmt2 = select(SellBatchItem).where(SellBatchItem.sell_tx_id == tx_id)
    result2 = await db.execute(stmt2)
    for sbi in result2.scalars().all():
        await db.delete(sbi)

    # 删除交易记录
    await db.delete(tx)
    await db.flush()

    # 重算该资产全部指标
    await recalc_asset(asset_id, user_id, db)

    await db.commit()
