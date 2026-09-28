"""避风港模型 — 不随市场波动的安全池"""
from datetime import datetime
from sqlalchemy import String, Numeric, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class Harbor(Base):
    __tablename__ = "harbor"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    balance: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="当前余额")
    total_in: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="累计转入")
    total_out: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="累计支出")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class HarborGoal(Base):
    """避风港消费目标，如"买相机"、"6个月房贷"等"""
    __tablename__ = "harbor_goals"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128), comment="目标名称")
    target_amount: Mapped[float] = mapped_column(Numeric(18, 4), comment="目标金额")
    saved_amount: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="已存金额")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())