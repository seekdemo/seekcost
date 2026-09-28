from pydantic import BaseModel
from datetime import datetime
from app.models.transaction import TransactionType, TxStatus
from app.models.profit_allocation import AllocationType


class ProfitAllocationIn(BaseModel):
    """利润分配请求项"""
    allocation_type: AllocationType
    amount: float
    target_asset_id: int | None = None  # 跨标的拯救时需要


class SellBatchItemIn(BaseModel):
    """卖出批次分配项 — 指定从哪个买入批次卖多少"""
    buy_tx_id: int
    quantity: float


class TransactionCreate(BaseModel):
    asset_id: int
    tx_type: TransactionType
    price: float
    quantity: float
    fee: float = 0
    note: str | None = None
    # 卖出时指定从哪些买入批次卖出（多批次）
    batch_items: list[SellBatchItemIn] | None = None
    # 卖出时附带利润分配方案
    allocations: list[ProfitAllocationIn] | None = None


class TransactionUpdate(BaseModel):
    """修改交易记录（价格/数量/手续费/备注/利润分配/批次分配）"""
    price: float | None = None
    quantity: float | None = None
    fee: float | None = None
    note: str | None = None
    allocations: list[ProfitAllocationIn] | None = None
    batch_items: list[SellBatchItemIn] | None = None


class SellBatchItemOut(BaseModel):
    id: int
    buy_tx_id: int
    quantity: float
    model_config = {"from_attributes": True}


class TransactionOut(BaseModel):
    id: int
    asset_id: int
    tx_type: TransactionType
    price: float
    quantity: float
    fee: float
    realized_profit: float
    sold_quantity: float
    status: TxStatus
    source_tx_id: int | None
    note: str | None
    created_at: datetime
    batch_items: list[SellBatchItemOut] = []

    model_config = {"from_attributes": True}