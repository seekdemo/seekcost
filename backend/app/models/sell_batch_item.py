"""卖出批次分配 — 一笔卖出可关联多个买入批次"""
from sqlalchemy import Numeric, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class SellBatchItem(Base):
    __tablename__ = "sell_batch_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    # 卖出交易ID
    sell_tx_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), index=True)
    # 买入交易ID（来源批次）
    buy_tx_id: Mapped[int] = mapped_column(Integer, ForeignKey("transactions.id"), index=True)
    # 从该批次卖出的数量
    quantity: Mapped[float] = mapped_column(Numeric(18, 4))

    # relationships
    sell_tx = relationship("Transaction", foreign_keys=[sell_tx_id], back_populates="batch_items")
    buy_tx = relationship("Transaction", foreign_keys=[buy_tx_id])