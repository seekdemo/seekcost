"""
标签模型 — 支持按板块/主题/策略等维度给资产打标签
多对多关系: Asset ↔ Tag
"""
from datetime import datetime
from sqlalchemy import String, DateTime, ForeignKey, Table, Column, Integer, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.core.database import Base


# 多对多关联表
asset_tags = Table(
    "asset_tags",
    Base.metadata,
    Column("asset_id", Integer, ForeignKey("assets.id", ondelete="CASCADE"), primary_key=True),
    Column("tag_id", Integer, ForeignKey("tags.id", ondelete="CASCADE"), primary_key=True),
)


class Tag(Base):
    __tablename__ = "tags"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_user_tag_name"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(32), comment="标签名称，如 '半导体'、'新能源'")
    color: Mapped[str] = mapped_column(String(16), default="#6366f1", comment="标签颜色 hex")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # 关系
    assets = relationship("Asset", secondary=asset_tags, back_populates="tags")