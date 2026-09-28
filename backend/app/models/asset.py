"""
资产模型 — 全资产账户矩阵
zone 区域:
  - active   动态博弈区 (股票/ETF/加密货币)
  - base     静态防御区 (理财/实物/房产)
  - invest   能力投资区 (课程/工具/流量)
"""
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class AssetZone(str, enum.Enum):
    ACTIVE = "active"   # 动态博弈区
    BASE = "base"       # 静态防御区
    INVEST = "invest"   # 能力投资区


class AssetCategory(str, enum.Enum):
    STOCK = "stock"
    ETF = "etf"
    CRYPTO = "crypto"
    DEPOSIT = "deposit"       # 银行定存
    BOND_FUND = "bond_fund"   # 债基
    PENSION = "pension"       # 养老金
    GOLD = "gold"
    COLLECTIBLE = "collectible"  # 收藏品
    REAL_ESTATE = "real_estate"  # 房产
    # ---- 能力投资类别 ----
    COURSE = "course"            # 课程/培训
    TOOL = "tool"                # 工具/服务
    TRAFFIC = "traffic"          # 流量/获客
    OTHER_INVEST = "other_invest"  # 其他投资


class AssetMarket(str, enum.Enum):
    US = "us"         # 美股
    CN = "cn"         # A股
    HK = "hk"         # 港股
    CRYPTO = "crypto" # 加密货币
    OTHER = "other"   # 其他 (基金/房产/能力投资等)


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True, comment="标的代码 如 NVDA / BTC")
    name: Mapped[str] = mapped_column(String(128), comment="显示名称")
    zone: Mapped[AssetZone] = mapped_column(Enum(AssetZone), index=True)
    category: Mapped[AssetCategory] = mapped_column(Enum(AssetCategory))
    market: Mapped[str] = mapped_column(String(16), default="other", index=True, comment="市场: us/cn/hk/crypto/other")

    # ---- 双成本记录 ----
    broker_cost: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="券商真实成本价")
    mental_cost: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="心理成本价（博弈账本）")
    quantity: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="持仓数量")
    current_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="当前市价")
    price_session: Mapped[str] = mapped_column(String(16), default="", comment="价格时段: pre_market/regular/post_market/closed")

    # ---- 零成本追踪 ----
    total_invested: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="累计投入本金")
    total_cashed: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="累计已套现利润")
    total_realized_pnl: Mapped[float] = mapped_column(
        Numeric(18, 4),
        default=0,
        comment="累计净已实现盈亏（盈利与亏损均计入）",
    )
    total_recovered: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="累计卖出回收本金（卖出总额-手续费-利润）")
    is_zero_cost: Mapped[bool] = mapped_column(default=False, comment="是否已达成零成本")

    # ---- 资金规划 ----
    planned_investment: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="预计投入金额")
    actual_investment: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="实际已投入金额")
    planned_includes_invested: Mapped[bool] = mapped_column(default=True, comment="预计投入是否包含已投入金额")
    is_cash: Mapped[bool] = mapped_column(default=False, comment="是否为现金资产")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # ---- 排序 & 置顶 & 归档 ----
    sort_order: Mapped[int] = mapped_column(default=0, comment="自定义排序序号，越小越靠前")
    pinned: Mapped[bool] = mapped_column(default=False, comment="是否置顶")
    archived: Mapped[bool] = mapped_column(default=False, comment="是否已归档（清仓/不再关注）")
    archived_note: Mapped[str | None] = mapped_column(String(256), nullable=True, comment="归档备注")

    transactions = relationship("Transaction", back_populates="asset", cascade="all, delete-orphan")
    trade_plans = relationship("TradePlan", back_populates="asset", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary="asset_tags", back_populates="assets")


import re as _re

def detect_market(symbol: str, category: str) -> str:
    """根据代码和类别自动推断市场"""
    s = symbol.strip().upper()
    cat = category.lower()

    # 加密货币
    if cat == "crypto":
        return "crypto"

    # 非股票/ETF类别归为 other
    if cat not in ("stock", "etf"):
        return "other"

    # A股: 6位纯数字
    if _re.match(r"^\d{6}$", s):
        return "cn"

    # A股带后缀: 600519.SH / 000001.SZ
    if _re.match(r"^\d{6}\.(SH|SZ|BJ)$", s):
        return "cn"

    # 港股: 纯4-5位数字 或 带.HK后缀
    if _re.match(r"^\d{4,5}$", s):
        return "hk"
    if _re.match(r"^\d{4,5}\.HK$", s):
        return "hk"

    # 美股: 1-5个字母（可能带.如 BRK.B）
    if _re.match(r"^[A-Z]{1,5}(\.[A-Z])?$", s):
        return "us"

    return "other"
