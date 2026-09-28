from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class ResearchGuide(Base):
    __tablename__ = 'research_guides'
    __table_args__ = (UniqueConstraint('user_id', 'stock_id', name='uq_research_guide_owner_stock'),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey('users.id', ondelete='CASCADE'), index=True)
    stock_id: Mapped[int] = mapped_column(ForeignKey('watch_stocks.id', ondelete='CASCADE'), index=True)
    version: Mapped[int] = mapped_column(Integer, default=0)
    step: Mapped[int] = mapped_column(Integer, default=0)
    mode: Mapped[str] = mapped_column(String(16), default='guided')
    answers: Mapped[dict] = mapped_column(JSON, default=dict)
    published_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    note_id: Mapped[int | None] = mapped_column(ForeignKey('notes.id', ondelete='SET NULL'), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
