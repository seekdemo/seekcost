from pydantic import BaseModel
from datetime import datetime
from app.models.asset import AssetZone, AssetCategory
from app.schemas.trade_plan import TradePlanOut
from app.schemas.tag import TagBrief


class AssetCreate(BaseModel):
    symbol: str
    name: str
    zone: AssetZone
    category: AssetCategory
    market: str | None = None
    broker_cost: float = 0
    mental_cost: float = 0
    quantity: float = 0
    current_price: float = 0
    total_invested: float = 0
    planned_investment: float = 0
    actual_investment: float = 0
    planned_includes_invested: bool = True
    is_cash: bool = False


class AssetUpdate(BaseModel):
    symbol: str | None = None
    name: str | None = None
    zone: AssetZone | None = None
    category: AssetCategory | None = None
    broker_cost: float | None = None
    mental_cost: float | None = None
    quantity: float | None = None
    current_price: float | None = None
    total_invested: float | None = None
    planned_investment: float | None = None
    actual_investment: float | None = None
    planned_includes_invested: bool | None = None
    market: str | None = None
    sort_order: int | None = None
    pinned: bool | None = None
    is_cash: bool | None = None


class AssetOut(BaseModel):
    id: int
    symbol: str
    name: str
    zone: AssetZone
    category: AssetCategory
    broker_cost: float
    mental_cost: float
    quantity: float
    current_price: float
    price_session: str = ""
    total_invested: float
    total_cashed: float
    total_realized_pnl: float = 0.0
    total_recovered: float = 0.0
    is_zero_cost: bool
    planned_investment: float
    actual_investment: float
    planned_includes_invested: bool
    market: str = "other"
    is_cash: bool
    sort_order: int
    pinned: bool
    archived: bool = False
    archived_note: str | None = None
    created_at: datetime
    updated_at: datetime
    tags: list[TagBrief] = []

    model_config = {"from_attributes": True}


# ---- 资产详情（含交易记录和利润分配） ----
class ProfitAllocationOut(BaseModel):
    id: int
    allocation_type: str
    amount: float
    target_asset_id: int | None
    created_at: datetime
    model_config = {"from_attributes": True}


class SellBatchItemDetail(BaseModel):
    id: int
    buy_tx_id: int
    quantity: float
    model_config = {"from_attributes": True}


class TransactionDetail(BaseModel):
    id: int
    tx_type: str
    price: float
    quantity: float
    fee: float
    realized_profit: float
    sold_quantity: float = 0
    status: str = "holding"
    source_tx_id: int | None = None
    note: str | None
    created_at: datetime
    allocations: list[ProfitAllocationOut] = []
    batch_items: list[SellBatchItemDetail] = []
    model_config = {"from_attributes": True}


class IBKRLotOut(BaseModel):
    """IBKR 持仓批次明细"""
    open_datetime: str
    quantity: float
    cost_price: float
    cost_basis: float
    close_price: float
    market_value: float
    unrealized_pnl: float
    model_config = {"from_attributes": True}


class AssetDetail(AssetOut):
    """资产详情：含完整交易记录和统计"""
    market_value: float = 0       # 当前市值
    broker_pnl: float = 0         # 券商浮动盈亏
    mental_pnl: float = 0         # 心理浮动盈亏
    total_realized: float = 0     # 旧字段：累计净已实现盈亏
    zero_cost_progress: float = 0 # 零成本进度 0~1
    investment_summary: dict = {}
    transactions: list[TransactionDetail] = []
    trade_plans: list[TradePlanOut] = []
    ibkr_lots: list[IBKRLotOut] = []  # IBKR持仓批次明细
