"""数据重置 API — 清除当前用户的所有交易与资产数据，用于重新导入"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from sqlalchemy.orm import selectinload

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset
from app.models.transaction import Transaction
from app.models.sell_batch_item import SellBatchItem
from app.models.profit_allocation import ProfitAllocation
from app.models.harbor import Harbor
from app.models.cash_account import CashAccount
from app.models.ibkr_lot import IBKRLotRecord

router = APIRouter(prefix="/data", tags=["数据管理"])


class ResetRequest(BaseModel):
    confirm: str  # 必须传 "RESET" 才执行


class ResetResponse(BaseModel):
    deleted_assets: int
    deleted_transactions: int
    deleted_batch_items: int
    deleted_allocations: int
    harbor_reset: bool
    cash_accounts_reset: int
    message: str


@router.post("/reset", response_model=ResetResponse)
async def reset_user_data(
    body: ResetRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """清除当前用户所有资产、交易、批次、利润分配数据，重置避风港余额。
    ⚠️ 此操作不可撤销！必须传 confirm="RESET" 确认。
    """
    if body.confirm != "RESET":
        raise HTTPException(400, '请传入 confirm="RESET" 以确认数据重置')

    # 1. 查出所有资产ID
    asset_ids_q = await db.execute(
        select(Asset.id).where(Asset.user_id == user.id)
    )
    asset_ids = [r[0] for r in asset_ids_q.all()]

    if not asset_ids:
        return ResetResponse(
            deleted_assets=0, deleted_transactions=0,
            deleted_batch_items=0, deleted_allocations=0,
            harbor_reset=False, cash_accounts_reset=0,
            message="无数据需要重置",
        )

    # 2. 查出所有交易ID（用于删除 batch_items 和 allocations）
    tx_ids_q = await db.execute(
        select(Transaction.id).where(Transaction.asset_id.in_(asset_ids))
    )
    tx_ids = [r[0] for r in tx_ids_q.all()]

    # 3. 删除 sell_batch_items & profit_allocations（依赖 transaction_id）
    n_bi = n_al = 0
    if tx_ids:
        r1 = await db.execute(delete(SellBatchItem).where(SellBatchItem.sell_tx_id.in_(tx_ids)))
        n_bi = r1.rowcount
        r2 = await db.execute(delete(ProfitAllocation).where(ProfitAllocation.transaction_id.in_(tx_ids)))
        n_al = r2.rowcount

    # 4. 删除交易
    r3 = await db.execute(delete(Transaction).where(Transaction.asset_id.in_(asset_ids)))
    n_tx = r3.rowcount

    # 4.5 删除 IBKR 批次数据
    await db.execute(delete(IBKRLotRecord).where(IBKRLotRecord.asset_id.in_(asset_ids)))

    # 5. 删除资产
    r4 = await db.execute(delete(Asset).where(Asset.user_id == user.id))
    n_asset = r4.rowcount

    # 6. 重置避风港余额
    harbor = (await db.execute(select(Harbor).where(Harbor.user_id == user.id))).scalars().first()
    harbor_reset = False
    if harbor:
        harbor.balance = 0
        harbor.total_in = 0
        harbor.total_out = 0
        harbor_reset = True

    # 7. 重置现金账户余额
    ca_r = await db.execute(select(CashAccount).where(CashAccount.user_id == user.id))
    cas = ca_r.scalars().all()
    for ca in cas:
        ca.balance = 0
    n_ca = len(cas)

    await db.commit()

    return ResetResponse(
        deleted_assets=n_asset,
        deleted_transactions=n_tx,
        deleted_batch_items=n_bi,
        deleted_allocations=n_al,
        harbor_reset=harbor_reset,
        cash_accounts_reset=n_ca,
        message=f"已清除 {n_asset} 个资产、{n_tx} 条交易记录，避风港和现金账户已重置",
    )