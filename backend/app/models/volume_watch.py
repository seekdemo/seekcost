"""Per-user threshold for completed-session volume observations."""
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class VolumeWatchSetting(Base):
    __tablename__ = "volume_watch_settings"
    __table_args__ = (UniqueConstraint("user_id", name="uq_volume_watch_user"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    threshold: Mapped[float] = mapped_column(Float, default=1.5, server_default="1.5")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
