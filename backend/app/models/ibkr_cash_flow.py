"""IBKR 存取款现金流水"""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Index, Numeric, String, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class IBKRCashFlowRecord(Base):
    __tablename__ = "ibkr_cash_flows"
    __table_args__ = (
        Index("ux_ibkr_cash_flows_user_fingerprint", "user_id", "import_fingerprint", unique=True),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    date: Mapped[str] = mapped_column(String(16), index=True, comment="结算日期")
    currency: Mapped[str] = mapped_column(String(8), default="USD", comment="币种")
    description: Mapped[str] = mapped_column(String(256), default="", comment="描述")
    amount: Mapped[float] = mapped_column(Numeric(18, 4), comment="金额，正数为入金，负数为出金")
    flow_type: Mapped[str] = mapped_column(String(16), index=True, comment="deposit / withdrawal")
    import_fingerprint: Mapped[str] = mapped_column(String(96), comment="导入去重指纹")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
