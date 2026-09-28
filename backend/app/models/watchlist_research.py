"""Structured private research sections for a watchlist company dossier."""
import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, JSON, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class WatchResearchSectionKey(str, enum.Enum):
    COMPANY_OVERVIEW = "company_overview"
    INDUSTRY_MOAT = "industry_moat"
    GROWTH_FINANCIALS = "growth_financials"
    RISKS_INVALIDATION = "risks_invalidation"
    VALUATION_DECISION = "valuation_decision"


class WatchStockResearchSection(Base):
    __tablename__ = "watch_stock_research_sections"
    __table_args__ = (
        UniqueConstraint("user_id", "stock_id", "key", name="uq_watch_research_user_stock_key"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey("watch_stocks.id", ondelete="CASCADE"), index=True)
    key: Mapped[WatchResearchSectionKey] = mapped_column(
        Enum(
            WatchResearchSectionKey,
            values_callable=lambda values: [item.value for item in values],
            native_enum=False,
            length=32,
        ),
        nullable=False,
    )
    summary: Mapped[str] = mapped_column(Text, default="", server_default="")
    evidence: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    open_questions: Mapped[list[dict]] = mapped_column(JSON, default=list, server_default="[]")
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    next_review_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    review_note: Mapped[str] = mapped_column(Text, default="", server_default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    user = relationship("User")
    stock = relationship("WatchStock")
