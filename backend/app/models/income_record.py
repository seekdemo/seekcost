"""收入记录模型"""
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, Integer, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class IncomeSource(str, enum.Enum):
    SALARY = "salary"           # 工资
    BONUS = "bonus"             # 奖金
    FREELANCE = "freelance"     # 自由职业
    INVESTMENT = "investment"   # 投资收益
    OTHER = "other"             # 其他


class IncomeRecord(Base):
    """收入记录"""
    __tablename__ = "income_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    salary_config_id: Mapped[int | None] = mapped_column(ForeignKey("salary_configs.id"), nullable=True)

    source: Mapped[IncomeSource] = mapped_column(Enum(IncomeSource), default=IncomeSource.SALARY)
    gross_amount: Mapped[float] = mapped_column(Numeric(18, 2), comment="税前金额")
    net_amount: Mapped[float] = mapped_column(Numeric(18, 2), comment="税后到手")
    tax: Mapped[float] = mapped_column(Numeric(18, 2), default=0, comment="个税")
    social_insurance: Mapped[float] = mapped_column(Numeric(18, 2), default=0, comment="社保(养老+医疗+失业)")
    housing_fund: Mapped[float] = mapped_column(Numeric(18, 2), default=0, comment="公积金")

    month: Mapped[str] = mapped_column(String(7), index=True, comment="所属月份 YYYY-MM")
    note: Mapped[str | None] = mapped_column(String(256), nullable=True)
    is_auto: Mapped[bool] = mapped_column(default=False, comment="是否自动生成")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())