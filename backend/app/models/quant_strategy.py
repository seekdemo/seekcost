"""Private quant-plugin settings, qualifications, and audit snapshots."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class QuantStrategySetting(Base):
    __tablename__ = "quant_strategy_settings"
    __table_args__ = (
        UniqueConstraint("user_id", "strategy_key", name="uq_quant_strategy_setting_user_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    strategy_key: Mapped[str] = mapped_column(String(64))
    enabled: Mapped[bool] = mapped_column(Boolean, default=False, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class QuantStrategyQualification(Base):
    __tablename__ = "quant_strategy_qualifications"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "strategy_key", "stock_id", name="uq_quant_qualification_user_key_stock"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    strategy_key: Mapped[str] = mapped_column(String(64))
    stock_id: Mapped[int] = mapped_column(
        ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True
    )
    historical_low: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    valuation_low: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    attention_low: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class QuantSignalSnapshot(Base):
    __tablename__ = "quant_signal_snapshots"
    __table_args__ = (
        Index(
            "ix_quant_snapshot_latest",
            "user_id",
            "strategy_key",
            "stock_id",
            "id",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    strategy_key: Mapped[str] = mapped_column(String(64))
    stock_id: Mapped[int] = mapped_column(
        ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True
    )
    signal: Mapped[str] = mapped_column(String(32))
    reason_codes: Mapped[list[str]] = mapped_column(JSON, default=list)
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)
    strategy_version: Mapped[str] = mapped_column(String(32))
    bar_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    source: Mapped[str] = mapped_column(String(64))
    execution_timing: Mapped[str | None] = mapped_column(String(32), nullable=True)
    error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    evaluated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
