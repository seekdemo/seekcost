"""
资产重算引擎 — 按时间顺序重放全部交易记录
当交易被修改或删除后调用，从零开始重新计算：
  - broker_cost, mental_cost, quantity (加权平均成本法)
  - total_invested, total_cashed, is_zero_cost (正利润回收追踪)
  - total_realized_pnl (包含盈利与亏损的净已实现盈亏)
  - 每笔交易的 realized_profit (卖出利润)
  - 利润分配副作用 (self_offset, cross_save, to_harbor)
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.models.asset import Asset
from app.models.transaction import Transaction, TransactionType, TxStatus
from app.models.profit_allocation import ProfitAllocation, AllocationType
from app.models.sell_batch_item import SellBatchItem
from app.models.harbor import Harbor


async def recalc_asset(asset_id: int, user_id: int, db: AsyncSession):
    """重放 asset_id 的全部交易，重新计算资产状态和每笔利润"""
    asset = await db.get(Asset, asset_id)
    if not asset:
        return
    if asset.is_cash:
        return

    # 归零
    asset.broker_cost = 0
    asset.mental_cost = 0
    asset.quantity = 0
    asset.total_invested = 0
    asset.total_cashed = 0
    asset.total_realized_pnl = 0
    asset.total_recovered = 0
    asset.is_zero_cost = False

    # 取该资产的全部交易（含利润分配），按时间升序
    stmt = (
        select(Transaction)
        .where(Transaction.asset_id == asset_id)
        .options(selectinload(Transaction.profit_allocations), selectinload(Transaction.batch_items))
        .order_by(Transaction.created_at.asc(), Transaction.id.asc())
    )
    result = await db.execute(stmt)
    txs = list(result.scalars().all())

    # 同一时间戳的交易：买入排在卖出前面（确保卖出时有正确的持仓成本）
    _type_order = {TransactionType.BUY: 0, TransactionType.SELL: 1, TransactionType.T_TRADE: 1}
    def _sort_key(t):
        dt = t.created_at
        if dt is None:
            dt_order = ""
        elif dt.tzinfo is None:
            # 时区朴素 → 当作 UTC
            dt_order = dt.isoformat() + "+00:00"
        else:
            dt_order = dt.isoformat()
        return (dt_order, _type_order.get(t.tx_type, 2), t.id)
    txs.sort(key=_sort_key)

    # 收集所有被跨标的分配影响的资产 id，后续需要重算
    cross_affected_ids: set[int] = set()

    # 预建买入交易索引，用于卖出时查找批次成本
    buy_txs = {tx.id: tx for tx in txs if tx.tx_type == TransactionType.BUY}

    # 追踪每个批次的剩余可用数量（用于卖出后重算加权成本）
    batch_remaining: dict[int, float] = {}
    for bt in buy_txs.values():
        batch_remaining[bt.id] = float(bt.quantity)

    for tx in txs:
        old_qty = float(asset.quantity)
        old_broker = float(asset.broker_cost)
        old_mental = float(asset.mental_cost)
        realized_profit = 0.0

        if tx.tx_type == TransactionType.BUY:
            new_qty = old_qty + float(tx.quantity)
            buy_cost = float(tx.price) * float(tx.quantity) + float(tx.fee)
            if new_qty > 0:
                asset.broker_cost = (old_broker * old_qty + buy_cost) / new_qty
                asset.mental_cost = (old_mental * old_qty + buy_cost) / new_qty
            asset.quantity = new_qty
            asset.total_invested = float(asset.total_invested) + buy_cost

        elif tx.tx_type in (TransactionType.SELL, TransactionType.T_TRADE):
            # 有批次分配时按每个批次的成本加权计算利润
            if tx.batch_items and len(tx.batch_items) > 0:
                realized_profit = 0.0
                for bi in tx.batch_items:
                    src = buy_txs.get(bi.buy_tx_id)
                    if src:
                        batch_cost = float(src.price) + float(src.fee) / float(src.quantity)
                        realized_profit += (float(tx.price) - batch_cost) * float(bi.quantity)
                        # 扣减批次剩余
                        batch_remaining[bi.buy_tx_id] = max(batch_remaining.get(bi.buy_tx_id, 0) - float(bi.quantity), 0)
                realized_profit -= float(tx.fee)
            elif tx.source_tx_id:
                # 兼容旧的单批次关联
                src = buy_txs.get(tx.source_tx_id)
                cost_base = float(src.price) + float(src.fee) / float(src.quantity) if src else old_broker
                realized_profit = (float(tx.price) - cost_base) * float(tx.quantity) - float(tx.fee)
                if src:
                    batch_remaining[tx.source_tx_id] = max(batch_remaining.get(tx.source_tx_id, 0) - float(tx.quantity), 0)
            else:
                realized_profit = (float(tx.price) - old_broker) * float(tx.quantity) - float(tx.fee)
                # 从最早的批次开始扣减 (FIFO)，保持 batch_remaining 一致
                sell_left = float(tx.quantity)
                for bid in sorted(batch_remaining.keys()):
                    if sell_left <= 0:
                        break
                    avail = batch_remaining[bid]
                    if avail <= 0:
                        continue
                    take = min(avail, sell_left)
                    batch_remaining[bid] -= take
                    sell_left -= take

            new_qty = old_qty - float(tx.quantity)
            asset.quantity = max(new_qty, 0)

            if new_qty <= 0:
                asset.broker_cost = 0
                asset.mental_cost = 0
            else:
                # 基于剩余批次重新计算加权平均成本
                total_cost = 0.0
                total_qty = 0.0
                for bid, rem in batch_remaining.items():
                    if rem > 0:
                        bt = buy_txs[bid]
                        unit_cost = float(bt.price) + float(bt.fee) / float(bt.quantity)
                        total_cost += unit_cost * rem
                        total_qty += rem
                if total_qty > 0:
                    asset.broker_cost = total_cost / total_qty
                    asset.mental_cost = total_cost / total_qty

            # 卖出回收总额 = 卖出金额 - 手续费（包含本金+利润）
            sell_proceeds = float(tx.price) * float(tx.quantity) - float(tx.fee)
            # 回收的本金部分 = 卖出回收总额 - 利润（利润可能为负，此时回收本金 > 卖出总额）
            recovered_principal = sell_proceeds - realized_profit
            if recovered_principal > 0:
                asset.total_recovered = float(asset.total_recovered) + recovered_principal

            if realized_profit > 0:
                asset.total_cashed = float(asset.total_cashed) + realized_profit
            asset.total_realized_pnl = float(asset.total_realized_pnl) + realized_profit

            if float(asset.total_invested) > 0 and float(asset.total_cashed) >= float(asset.total_invested):
                asset.is_zero_cost = True

        # 更新交易记录上的 realized_profit
        tx.realized_profit = realized_profit

        # 重放利润分配
        for alloc in tx.profit_allocations:
            if alloc.allocation_type == AllocationType.SELF_OFFSET:
                cur_qty = float(asset.quantity)
                if cur_qty > 0:
                    asset.mental_cost = float(asset.mental_cost) - float(alloc.amount) / cur_qty

            elif alloc.allocation_type == AllocationType.CROSS_SAVE and alloc.target_asset_id:
                cross_affected_ids.add(alloc.target_asset_id)

            # to_harbor 在下面统一处理

    # ---- 重算批次追踪 (sold_quantity / status) ----
    # 直接使用重放过程中维护的 batch_remaining，兼容显式批次、旧 source_tx_id 和 FIFO 卖出。
    for bt in buy_txs.values():
        original_qty = float(bt.quantity)
        remaining = max(0.0, min(original_qty, batch_remaining.get(bt.id, original_qty)))
        sold = max(0.0, original_qty - remaining)
        bt.sold_quantity = sold
        if remaining <= 0.0001:
            bt.status = TxStatus.CLEARED
        elif sold > 0.0001:
            bt.status = TxStatus.PARTIAL_SOLD
        else:
            bt.status = TxStatus.HOLDING

    # ---- 重算避风港 ----
    await _recalc_harbor(user_id, db)

    # ---- 重算被跨标的影响的资产的 mental_cost ----
    for target_id in cross_affected_ids:
        await _recalc_cross_target(target_id, db)


async def _recalc_cross_target(target_asset_id: int, db: AsyncSession):
    """
    重算某资产受到的所有 cross_save 利润分配的影响。
    思路：先还原该资产的 mental_cost 为 broker_cost（去掉所有外部分配的影响），
    然后重新叠加所有指向该资产的 cross_save 分配。
    注意：该资产自身的交易也可能通过 self_offset 影响 mental_cost，
    所以最安全的做法是完整重放该资产。
    """
    target = await db.get(Asset, target_asset_id)
    if not target:
        return

    # 简单方案：重放目标资产的自身交易
    # 归零
    target.broker_cost = 0
    target.mental_cost = 0
    target.quantity = 0
    target.total_invested = 0
    target.total_cashed = 0
    target.total_realized_pnl = 0
    target.total_recovered = 0
    target.is_zero_cost = False

    stmt = (
        select(Transaction)
        .where(Transaction.asset_id == target_asset_id)
        .options(selectinload(Transaction.profit_allocations))
        .order_by(Transaction.created_at.asc(), Transaction.id.asc())
    )
    result = await db.execute(stmt)
    txs = list(result.scalars().all())

    # 同一时间戳的交易：买入排在卖出前面
    _type_order = {TransactionType.BUY: 0, TransactionType.SELL: 1, TransactionType.T_TRADE: 1}
    def _sort_key(t):
        dt = t.created_at
        if dt is None:
            dt_order = ""
        elif dt.tzinfo is None:
            dt_order = dt.isoformat() + "+00:00"
        else:
            dt_order = dt.isoformat()
        return (dt_order, _type_order.get(t.tx_type, 2), t.id)
    txs.sort(key=_sort_key)

    # 预建买入交易索引
    ct_buy_txs = {tx.id: tx for tx in txs if tx.tx_type == TransactionType.BUY}

    for tx in txs:
        old_qty = float(target.quantity)
        old_broker = float(target.broker_cost)
        old_mental = float(target.mental_cost)
        realized_profit = 0.0

        if tx.tx_type == TransactionType.BUY:
            new_qty = old_qty + float(tx.quantity)
            buy_cost = float(tx.price) * float(tx.quantity) + float(tx.fee)
            if new_qty > 0:
                target.broker_cost = (old_broker * old_qty + buy_cost) / new_qty
                target.mental_cost = (old_mental * old_qty + buy_cost) / new_qty
            target.quantity = new_qty
            target.total_invested = float(target.total_invested) + buy_cost

        elif tx.tx_type in (TransactionType.SELL, TransactionType.T_TRADE):
            # 指定批次时用批次买入成本，否则用整体加权平均成本
            cost_base = old_broker
            if tx.source_tx_id:
                src = ct_buy_txs.get(tx.source_tx_id)
                if src:
                    cost_base = float(src.price) + float(src.fee) / float(src.quantity)
            realized_profit = (float(tx.price) - cost_base) * float(tx.quantity) - float(tx.fee)
            new_qty = old_qty - float(tx.quantity)
            target.quantity = max(new_qty, 0)
            if new_qty <= 0:
                target.broker_cost = 0
                target.mental_cost = 0
            # 回收本金
            sell_proceeds = float(tx.price) * float(tx.quantity) - float(tx.fee)
            recovered_principal = sell_proceeds - realized_profit
            if recovered_principal > 0:
                target.total_recovered = float(target.total_recovered) + recovered_principal
            if realized_profit > 0:
                target.total_cashed = float(target.total_cashed) + realized_profit
            target.total_realized_pnl = float(target.total_realized_pnl) + realized_profit
            if float(target.total_invested) > 0 and float(target.total_cashed) >= float(target.total_invested):
                target.is_zero_cost = True

        tx.realized_profit = realized_profit

        for alloc in tx.profit_allocations:
            if alloc.allocation_type == AllocationType.SELF_OFFSET:
                cur_qty = float(target.quantity)
                if cur_qty > 0:
                    target.mental_cost = float(target.mental_cost) - float(alloc.amount) / cur_qty

    # 叠加所有外部 cross_save 分配
    stmt2 = (
        select(ProfitAllocation)
        .where(
            ProfitAllocation.target_asset_id == target_asset_id,
            ProfitAllocation.allocation_type == AllocationType.CROSS_SAVE,
        )
    )
    result2 = await db.execute(stmt2)
    cross_allocs = result2.scalars().all()

    cur_qty = float(target.quantity)
    if cur_qty > 0:
        total_cross = sum(float(a.amount) for a in cross_allocs)
        target.mental_cost = float(target.mental_cost) - total_cross / cur_qty


async def _recalc_harbor(user_id: int, db: AsyncSession):
    """重算用户的避风港余额（基于所有 to_harbor 利润分配）"""
    harbor = (await db.execute(
        select(Harbor).where(Harbor.user_id == user_id)
    )).scalars().first()

    if not harbor:
        return  # 没有避风港，无需处理

    # 查所有 to_harbor 分配
    stmt = (
        select(ProfitAllocation)
        .join(Transaction, ProfitAllocation.transaction_id == Transaction.id)
        .join(Asset, Transaction.asset_id == Asset.id)
        .where(
            Asset.user_id == user_id,
            ProfitAllocation.allocation_type == AllocationType.TO_HARBOR,
        )
    )
    result = await db.execute(stmt)
    allocs = result.scalars().all()

    total_in = sum(float(a.amount) for a in allocs)
    harbor.total_in = total_in
    harbor.balance = total_in - float(harbor.total_out)
