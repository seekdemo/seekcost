"""财务模块 — Pydantic schemas"""
from pydantic import BaseModel
from datetime import datetime, date


# ── 工资配置 ──
class SalaryConfigCreate(BaseModel):
    gross_salary: float
    pay_day: int = 15
    currency: str = "CNY"
    country: str = "cn"
    pension_rate: float = 0.08
    medical_rate: float = 0.02
    unemployment_rate: float = 0.005
    housing_fund_rate: float = 0.12
    special_deduction: float = 0
    custom_tax_rate: float | None = None
    custom_deductions: float | None = None
    custom_brackets: str | None = None

class SalaryConfigUpdate(BaseModel):
    gross_salary: float | None = None
    pay_day: int | None = None
    currency: str | None = None
    country: str | None = None
    pension_rate: float | None = None
    medical_rate: float | None = None
    unemployment_rate: float | None = None
    housing_fund_rate: float | None = None
    special_deduction: float | None = None
    custom_tax_rate: float | None = None
    custom_deductions: float | None = None
    custom_brackets: str | None = None
    is_active: bool | None = None

class SalaryConfigOut(BaseModel):
    id: int
    gross_salary: float
    pay_day: int
    currency: str
    country: str
    pension_rate: float
    medical_rate: float
    unemployment_rate: float
    housing_fund_rate: float
    special_deduction: float
    custom_tax_rate: float | None
    custom_deductions: float | None
    custom_brackets: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── 工资预览 ──
class SalaryPreviewReq(BaseModel):
    gross_salary: float
    country: str = "cn"
    month_index: int = 1
    pension_rate: float = 0.08
    medical_rate: float = 0.02
    unemployment_rate: float = 0.005
    housing_fund_rate: float = 0.12
    special_deduction: float = 0
    custom_tax_rate: float | None = None
    custom_deductions: float | None = None
    custom_brackets: str | None = None

class SalaryPreviewOut(BaseModel):
    gross: float
    social_insurance: float
    housing_fund: float
    tax: float
    net: float


# ── 收入记录 ──
class IncomeRecordCreate(BaseModel):
    source: str = "salary"
    gross_amount: float
    net_amount: float
    tax: float = 0
    social_insurance: float = 0
    housing_fund: float = 0
    month: str
    note: str | None = None

class IncomeRecordOut(BaseModel):
    id: int
    source: str
    gross_amount: float
    net_amount: float
    tax: float
    social_insurance: float
    housing_fund: float
    month: str
    note: str | None
    is_auto: bool
    salary_config_id: int | None
    created_at: datetime
    model_config = {"from_attributes": True}


# ── 负债 ──
class LiabilityCreate(BaseModel):
    name: str
    liability_type: str = "other"
    total_amount: float
    remaining_amount: float
    monthly_payment: float = 0
    interest_rate: float = 0
    start_date: date | None = None
    end_date: date | None = None

class LiabilityUpdate(BaseModel):
    name: str | None = None
    liability_type: str | None = None
    total_amount: float | None = None
    remaining_amount: float | None = None
    monthly_payment: float | None = None
    interest_rate: float | None = None
    start_date: date | None = None
    end_date: date | None = None

class LiabilityOut(BaseModel):
    id: int
    name: str
    liability_type: str
    total_amount: float
    remaining_amount: float
    monthly_payment: float
    interest_rate: float
    start_date: date | None
    end_date: date | None
    profit_repaid: float
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}


# ── 净资产概览 ──
class NetWorthOverview(BaseModel):
    total_assets: float
    total_liabilities: float
    net_worth: float
    asset_breakdown: dict[str, float]  # zone -> value
    monthly_income: float  # 本月收入
    yearly_income: float   # 本年收入
    exchange_rates: dict[str, float] = {}  # 汇率信息