"""负债池模型"""
import enum
from datetime import datetime, date
from sqlalchemy import String, Numeric, Enum, DateTime, Date, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class LiabilityType(str, enum.Enum):
    MORTGAGE = "mortgage"         # 房贷
    CAR_LOAN = "car_loan"         # 车贷
    CREDIT_CARD = "credit_card"   # 信用卡
    STUDENT_LOAN = "student_loan" # 学生贷款
    PERSONAL_LOAN = "personal_loan"  # 个人贷款
    OTHER = "other"               # 其他


class Liability(Base):
    __tablename__ = "liabilities"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(128), comment="负债名称")
    liability_type: Mapped[LiabilityType] = mapped_column(Enum(LiabilityType))
    total_amount: Mapped[float] = mapped_column(Numeric(18, 4), comment="总负债")
    remaining_amount: Mapped[float] = mapped_column(Numeric(18, 4), comment="剩余待还")
    monthly_payment: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="月供")

    # ---- 新增字段 ----
    interest_rate: Mapped[float] = mapped_column(Numeric(8, 4), default=0, comment="年利率 %")
    start_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="起始日期")
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True, comment="到期日期")

    # 利润还贷追踪
    profit_repaid: Mapped[float] = mapped_column(Numeric(18, 4), default=0, comment="投资利润累计还贷金额")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())