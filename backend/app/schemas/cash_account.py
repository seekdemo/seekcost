"""现金账户 — Pydantic schemas"""
from pydantic import BaseModel
from datetime import datetime


class CashAccountCreate(BaseModel):
    name: str
    balance: float = 0
    currency: str = "CNY"
    note: str | None = None


class CashAccountUpdate(BaseModel):
    name: str | None = None
    balance: float | None = None
    currency: str | None = None
    is_active: bool | None = None
    note: str | None = None


class CashAccountOut(BaseModel):
    id: int
    name: str
    balance: float
    currency: str
    is_active: bool
    note: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class CashAccountAdjust(BaseModel):
    amount: float
    note: str | None = None


class PortfolioSummary(BaseModel):
    """投资组合资金摘要"""
    total_cash: float
    total_planned_investment: float
    total_actual_investment: float
    remaining_cash: float
    cash_accounts: list[CashAccountOut]