"""用户模型"""
from datetime import datetime
from sqlalchemy import JSON, String, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(256))
    nickname: Mapped[str] = mapped_column(String(64), default="")
    theme: Mapped[str] = mapped_column(String(32), default="emerald")
    default_currency: Mapped[str] = mapped_column(String(8), default="CNY", comment="默认显示货币: CNY/USD/HKD")
    nav_items: Mapped[list[str] | None] = mapped_column(JSON, nullable=True, default=None)
    avatar_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 关系
    cash_accounts = relationship("CashAccount", back_populates="user", cascade="all, delete-orphan")
