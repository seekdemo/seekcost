"""交易记录模型"""
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, ForeignKey, func, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class TransactionType(str, enum.Enum):
    BUY = "buy"
    SELL = "sell"
    T_TRADE = "t_trade"  # 做T


class TxStatus(str, enum.Enum):
    """买入交易的持仓状态"""
    HOLDING = "holding"           # 持仓中（未卖出或部分卖出）
    PARTIAL_SOLD = "partial_sold" # 部分卖出
    CLEARED = "cleared"           # 已清仓


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        Index("ux_transactions_asset_import_fingerprint", "asset_id", "import_fingerprint", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("assets.id"), index=True)
    tx_type: Mapped[TransactionType] = mapped_column(Enum(TransactionType))

    price: Mapped[float] = mapped_column(Numeric(18, 4), comment="成交价")
    quantity: Mapped[float] = mapped_column(Numeric(18, 4), comment="成交数量")
    fee: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="手续费/印花税")

    # 卖出产生的利润（卖出时计算）
    realized_profit: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="实现利润")

    # ---- 批次追踪 ----
    sold_quantity: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="已卖出数量（仅买入记录）")
    status: Mapped[TxStatus] = mapped_column(
        Enum(TxStatus), default=TxStatus.HOLDING, server_default="HOLDING",
        comment="持仓状态（仅买入记录）"
    )
    # 卖出记录指向对应的买入批次（可选，单批次卖出时填写）
    source_tx_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("transactions.id"), nullable=True,
        comment="来源买入交易ID（仅卖出记录）"
    )

    note: Mapped[str | None] = mapped_column(String(512), nullable=True, comment="备注")
    import_fingerprint: Mapped[str | None] = mapped_column(
        String(128), nullable=True, comment="导入去重指纹（同一资产内唯一）"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    asset = relationship("Asset", back_populates="transactions")
    profit_allocations = relationship("ProfitAllocation", back_populates="transaction", cascade="all, delete-orphan")
    # 自引用：卖出记录 -> 买入记录（旧单批次字段，保留兼容）
    source_tx = relationship("Transaction", remote_side="Transaction.id", foreign_keys=[source_tx_id])
    # 多批次分配（卖出记录关联多个买入批次）
    batch_items = relationship("SellBatchItem", foreign_keys="SellBatchItem.sell_tx_id", back_populates="sell_tx", cascade="all, delete-orphan")
