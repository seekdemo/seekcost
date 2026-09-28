from datetime import datetime
from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class AlertRule(Base):
    __tablename__ = "custom_alert_rules"
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True, nullable=True)
    scope: Mapped[str] = mapped_column(String(12), default="single", server_default="single")
    name: Mapped[str] = mapped_column(String(100))
    period: Mapped[int] = mapped_column(Integer)
    tolerance: Mapped[float] = mapped_column(Float)
    side: Mapped[str] = mapped_column(String(12), default="both")
    cooldown_minutes: Mapped[int] = mapped_column(Integer, default=1440)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    inside: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class AlertRuleState(Base):
    __tablename__ = "custom_alert_rule_states"
    __table_args__ = (UniqueConstraint("rule_id", "stock_id", name="uq_alert_rule_state_target"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    rule_id: Mapped[int] = mapped_column(ForeignKey("custom_alert_rules.id", ondelete="CASCADE"))
    stock_id: Mapped[int] = mapped_column(ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True)
    inside: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[str] = mapped_column(String(32), default="pending")
    checked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_triggered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    evidence: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class AlertNotification(Base):
    __tablename__ = "alert_notifications"
    __table_args__ = (Index("ix_alert_notifications_inbox", "user_id", "read_at", "id"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    rule_id: Mapped[int | None] = mapped_column(ForeignKey("custom_alert_rules.id", ondelete="SET NULL"), nullable=True)
    stock_id: Mapped[int | None] = mapped_column(ForeignKey("watch_stocks.id", ondelete="SET NULL"), nullable=True)
    rule_name: Mapped[str] = mapped_column(String(100))
    symbol: Mapped[str] = mapped_column(String(32))
    evidence: Mapped[dict] = mapped_column(JSON)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
