"""股票池与个股速记模型"""
import enum
from datetime import date, datetime
from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, JSON, Numeric, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class WatchStage(str, enum.Enum):
    RADAR = "radar"
    CONVICTION = "conviction"
    STRIKE = "strike"


class EarningsStatus(str, enum.Enum):
    ESTIMATED = "estimated"
    CONFIRMED = "confirmed"
    REPORTED = "reported"


class WatchStock(Base):
    __tablename__ = "watch_stocks"
    __table_args__ = (UniqueConstraint("user_id", "symbol", name="uq_watch_stock_user_symbol"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    symbol: Mapped[str] = mapped_column(String(32), index=True)
    name: Mapped[str] = mapped_column(String(128), default="")
    stage: Mapped[WatchStage] = mapped_column(Enum(WatchStage), default=WatchStage.RADAR, server_default="RADAR", index=True)
    sector: Mapped[str] = mapped_column(String(256), default="")
    industries: Mapped[list[str]] = mapped_column(JSON, default=list)
    concepts: Mapped[list[str]] = mapped_column(JSON, default=list)
    inspiration: Mapped[str] = mapped_column(Text, default="")
    entry_reason: Mapped[str] = mapped_column(Text, default="")
    business_summary: Mapped[str] = mapped_column(Text, default="")
    growth_drivers: Mapped[str] = mapped_column(Text, default="")
    fundamental_risks: Mapped[str] = mapped_column(Text, default="")
    fundamental_metrics: Mapped[list[dict]] = mapped_column(JSON, default=list)
    thesis: Mapped[str] = mapped_column(Text, default="")
    invalidation: Mapped[str] = mapped_column(Text, default="")
    current_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    price_change: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    price_change_pct: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    price_session: Mapped[str] = mapped_column(String(32), default="")
    fair_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    strike_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    target_price: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    planned_capital: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    tranches: Mapped[int] = mapped_column(default=3)
    first_entry_drop: Mapped[float] = mapped_column(Numeric(18, 4), default=0)
    add_on_drop: Mapped[float] = mapped_column(Numeric(18, 4), default=10)
    notes: Mapped[str] = mapped_column(Text, default="")
    milestones: Mapped[list[dict]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    memos = relationship("StockMemo", back_populates="stock", cascade="all, delete-orphan")
    earnings_events = relationship("EarningsEvent", back_populates="stock", cascade="all, delete-orphan")


class EarningsEvent(Base):
    __tablename__ = "earnings_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True)
    event_date: Mapped[date] = mapped_column(Date, index=True)
    fiscal_period: Mapped[str] = mapped_column(String(64), default="")
    status: Mapped[EarningsStatus] = mapped_column(
        Enum(EarningsStatus), default=EarningsStatus.ESTIMATED, server_default="ESTIMATED", index=True
    )
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="manual", server_default="manual")
    synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    stock = relationship("WatchStock", back_populates="earnings_events")


class StockMemo(Base):
    __tablename__ = "stock_memos"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True)
    content: Mapped[str] = mapped_column(Text, default="")
    pinned: Mapped[bool] = mapped_column(Boolean, default=False)
    converted_note_id: Mapped[int | None] = mapped_column(ForeignKey("notes.id", ondelete="SET NULL"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    stock = relationship("WatchStock", back_populates="memos")
