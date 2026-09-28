"""工资配置模型"""
import enum
from datetime import datetime
from sqlalchemy import String, Numeric, Enum, DateTime, Integer, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base


class TaxCountry(str, enum.Enum):
    CN = "cn"           # 中国
    US = "us"           # 美国
    CUSTOM = "custom"   # 自定义


class SalaryConfig(Base):
    """工资配置 — 每个用户一条活跃配置"""
    __tablename__ = "salary_configs"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    gross_salary: Mapped[float] = mapped_column(Numeric(18, 2), comment="税前月薪")
    pay_day: Mapped[int] = mapped_column(Integer, default=15, comment="发薪日(1-31)")
    currency: Mapped[str] = mapped_column(String(8), default="CNY", comment="货币 CNY/USD")
    country: Mapped[TaxCountry] = mapped_column(Enum(TaxCountry), default=TaxCountry.CN, comment="税制国家")

    # ---- 中国五险一金比例（个人缴纳部分） ----
    pension_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.08, comment="养老保险 8%")
    medical_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.02, comment="医疗保险 2%")
    unemployment_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.005, comment="失业保险 0.5%")
    housing_fund_rate: Mapped[float] = mapped_column(Numeric(6, 4), default=0.07, comment="公积金 7%")

    # ---- 中国专项附加扣除 ----
    special_deduction: Mapped[float] = mapped_column(Numeric(18, 2), default=0, comment="专项附加扣除/月")

    # ---- 自定义税率模式 ----
    custom_tax_rate: Mapped[float | None] = mapped_column(Numeric(6, 4), nullable=True, comment="自定义固定税率")
    custom_deductions: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True, comment="自定义免征额/月")
    # 自定义累进税率表 JSON: [{"min":0,"max":10000,"rate":0.1},...]
    custom_brackets: Mapped[str | None] = mapped_column(Text, nullable=True, comment="自定义累进税率表 JSON")

    is_active: Mapped[bool] = mapped_column(default=True, comment="是否启用")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())