from pydantic import BaseModel


class HarborStatus(BaseModel):
    balance: float
    total_in: float
    total_out: float


class AssetSummary(BaseModel):
    id: int
    symbol: str
    name: str
    zone: str
    market: str = "other"       # 市场: us/cn/hk/crypto/other
    mental_cost: float
    broker_cost: float
    current_price: float
    price_session: str = ""
    quantity: float
    mental_pnl: float           # 博弈账本盈亏
    broker_pnl: float           # 真实账本盈亏
    zero_cost_progress: float   # 零成本进度 0~1


class InvestSummary(BaseModel):
    """能力投资区资产概要"""
    id: int
    symbol: str
    name: str
    category: str
    market: str = "other"
    total_invested: float    # 累计投入
    total_cashed: float      # 已归因回本
    return_rate: float       # 回本率 0~1


class DashboardResponse(BaseModel):
    """博弈仪表盘"""
    # 持仓市值（已按汇率统一换算）
    mental_net_worth: float
    broker_net_worth: float

    # ---- 核心指标（统一按汇率换算）----
    # 持仓成本（当前持仓的成本价 × 数量合计）
    holding_cost_cny: float = 0.0
    # 持仓市值
    market_value_cny: float = 0.0
    # 已废弃：不要再用买入交易额代表现金投入
    stock_invested_cny: float = 0.0
    # IBKR 入出金现金流（来自活动报表“存款和取款”）
    ibkr_deposits_cny: float = 0.0
    ibkr_withdrawals_cny: float = 0.0
    ibkr_net_deposit_cny: float = 0.0
    # 净已实现盈亏（所有卖出盈利与亏损的净额）
    total_realized_pnl_cny: float = 0.0
    # 未实现浮盈（持仓市值 - 持仓成本）
    unrealized_pnl_cny: float = 0.0
    # 总盈亏 = 已实现利润 + 未实现浮盈
    total_pnl_cny: float = 0.0

    # ---- 向后兼容旧字段（保留以免前端崩溃）----
    total_recovered_cny: float = 0.0
    total_assets_cny: float = 0.0
    total_cashed_cny: float = 0.0

    # 用户默认显示货币
    default_currency: str = "CNY"

    # 避风港
    harbor: HarborStatus

    # 资产列表
    active_assets: list[AssetSummary]
    base_assets: list[AssetSummary]
    invest_assets: list[InvestSummary]

    # 心理安全分 (0~100)
    safety_score: float

    # 零成本资产数量
    zero_cost_count: int

    # 汇率信息 { "USD": 7.24, "HKD": 0.93, "CNY": 1.0, ... }
    exchange_rates: dict[str, float] = {}
