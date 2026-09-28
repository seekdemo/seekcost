"""IBKR 持仓批次模型 — 存储从 IBKR 活动报表解析的 Lot 明细"""
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class IBKRLotRecord(Base):
    __tablename__ = "ibkr_lots"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True, comment="股票代码")
    open_datetime: Mapped[str] = mapped_column(String(32), comment="买入时间 如 2026-02-09, 13:21:14")
    quantity: Mapped[float] = mapped_column(Numeric(18, 4), comment="持有数量")
    cost_price: Mapped[float] = mapped_column(Numeric(18, 4), comment="每股成本价")
    cost_basis: Mapped[float] = mapped_column(Numeric(18, 4), comment="成本基础(含佣金)")
    close_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="收盘价")
    market_value: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="市值")
    unrealized_pnl: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="未实现损益")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())