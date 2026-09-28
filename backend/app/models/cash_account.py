from datetime import datetime
from sqlalchemy import Column, Integer, String, DECIMAL, Boolean, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.core.database import Base

class CashAccount(Base):
    __tablename__ = "cash_accounts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)  # 账户名称
    balance = Column(DECIMAL(18, 4), nullable=False, default=0)  # 当前余额
    currency = Column(String(3), nullable=False, default="CNY")  # 货币
    is_active = Column(Boolean, nullable=False, default=True)
    note = Column(Text)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    # 关系
    user = relationship("User", back_populates="cash_accounts")