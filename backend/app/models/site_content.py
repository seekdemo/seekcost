"""Public editorial content; independent of users' private investment records."""
from datetime import datetime
from sqlalchemy import String, JSON, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class SiteAdmin(Base):
    __tablename__ = "site_admins"
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class SiteContent(Base):
    __tablename__ = "site_content"
    key: Mapped[str] = mapped_column(String(40), primary_key=True)
    locale: Mapped[str] = mapped_column(String(12), primary_key=True)
    draft: Mapped[dict] = mapped_column(JSON)
    published: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    version: Mapped[int] = mapped_column(default=0)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ContentAudit(Base):
    __tablename__ = "content_audit"
    id: Mapped[int] = mapped_column(primary_key=True)
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action: Mapped[str] = mapped_column(String(20))
    key: Mapped[str] = mapped_column(String(40))
    locale: Mapped[str] = mapped_column(String(12))
    version: Mapped[int] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
