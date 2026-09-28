"""
利润分配模型 — 博弈引擎核心
三路利润流转:
  - self_offset    原位摊薄
  - cross_save     跨标的拯救
  - to_harbor      提取至避风港
"""
import enum
from datetime import datetime
from sqlalchemy import Numeric, Enum, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class AllocationType(str, enum.Enum):
    SELF_OFFSET = "self_offset"   # 原位摊薄
    CROSS_SAVE = "cross_save"     # 跨标的拯救
    TO_HARBOR = "to_harbor"       # 提取至避风港


class ProfitAllocation(Base):
    __tablename__ = "profit_allocations"

    id: Mapped[int] = mapped_column(primary_key=True)
    transaction_id: Mapped[int] = mapped_column(ForeignKey("transactions.id"), index=True, comment="来源卖出交易")
    allocation_type: Mapped[AllocationType] = mapped_column(Enum(AllocationType))

    amount: Mapped[float] = mapped_column(Numeric(18, 4), comment="分配金额")

    # 跨标的拯救时，目标资产
    target_asset_id: Mapped[int | None] = mapped_column(
        ForeignKey("assets.id"), nullable=True, comment="目标资产（跨标的时使用）"
    )

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    transaction = relationship("Transaction", back_populates="profit_allocations")
    target_asset = relationship("Asset", foreign_keys=[target_asset_id])