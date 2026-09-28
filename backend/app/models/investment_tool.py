"""Private directory entries for investment tools."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class InvestmentTool(Base):
    __tablename__ = "investment_tools"
    __table_args__ = (
        UniqueConstraint("user_id", "url", name="uq_investment_tool_user_url"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    category: Mapped[str] = mapped_column(String(32), nullable=False, default="other")
    pricing: Mapped[str] = mapped_column(String(24), nullable=False, default="unknown")
    tags: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    source_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    icon_url: Mapped[str | None] = mapped_column(String(2048), nullable=True)
    starred: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
