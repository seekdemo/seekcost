"""交易计划模型 — 博弈资产预期管理"""
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, ForeignKey, Text, func, Boolean
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class PlanStatus(str, enum.Enum):
    ACTIVE = "active"       # 执行中
    COMPLETED = "completed" # 已完成
    ABANDONED = "abandoned" # 已放弃


class TradePlan(Base):
    __tablename__ = "trade_plans"

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id", ondelete="CASCADE"), index=True)
    status: Mapped[PlanStatus] = mapped_column(
        Enum(PlanStatus), default=PlanStatus.ACTIVE, server_default="ACTIVE"
    )

    # ---- 仓位规划 ----
    target_position: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="目标仓位(股数)")
    max_position: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="最大仓位上限")

    # ---- 价格区间 ----
    build_low: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="建仓区间下限")
    build_high: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="建仓区间上限")
    stop_loss: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="止损价")
    take_profit_1: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="第一止盈位")
    take_profit_2: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="第二止盈位")
    take_profit_3: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="第三止盈位")

    # ---- 关键位 ----
    support_1: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="支撑位1")
    support_2: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="支撑位2")
    resistance_1: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="压力位1")
    resistance_2: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True, comment="压力位2")

    # ---- 策略文本 ----
    buy_strategy: Mapped[str | None] = mapped_column(Text, nullable=True, comment="买入策略")
    sell_strategy: Mapped[str | None] = mapped_column(Text, nullable=True, comment="卖出策略")
    note: Mapped[str | None] = mapped_column(Text, nullable=True, comment="备注/交易纪律")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    asset = relationship("Asset", back_populates="trade_plans")