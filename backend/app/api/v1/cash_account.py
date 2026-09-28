"""现金账户 API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.cash_account import CashAccount
from app.models.asset import Asset
from app.schemas.cash_account import (
    CashAccountCreate, CashAccountUpdate, CashAccountOut, 
    CashAccountAdjust, PortfolioSummary
)

router = APIRouter(prefix="/cash-accounts", tags=["现金账户"])

@router.get("", response_model=list[CashAccountOut])
async def list_cash_accounts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """获取用户现金账户列表"""
    stmt = select(CashAccount).where(
        CashAccount.user_id == user.id,
        CashAccount.is_active == True
    ).order_by(CashAccount.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()

@router.post("", response_model=CashAccountOut, status_code=201)
async def create_cash_account(
    body: CashAccountCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """创建现金账户"""
    account = CashAccount(
        user_id=user.id,
        name=body.name,
        balance=body.balance,
        currency=body.currency,
        note=body.note
    )
    db.add(account)
    await db.commit()
    await db.refresh(account)
    return account

@router.patch("/{account_id}", response_model=CashAccountOut)
async def update_cash_account(
    account_id: int,
    body: CashAccountUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """更新现金账户"""
    account = await db.get(CashAccount, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="账户不存在")
    
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(account, field, value)
    
    await db.commit()
    await db.refresh(account)
    return account

@router.delete("/{account_id}")
async def delete_cash_account(
    account_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """删除现金账户"""
    account = await db.get(CashAccount, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="账户不存在")
    
    await db.delete(account)
    await db.commit()
    return {"message": "账户已删除"}

@router.post("/{account_id}/adjust-balance", response_model=CashAccountOut)
async def adjust_balance(
    account_id: int,
    body: CashAccountAdjust,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """调整账户余额"""
    account = await db.get(CashAccount, account_id)
    if not account or account.user_id != user.id:
        raise HTTPException(status_code=404, detail="账户不存在")
    
    account.balance += body.amount
    await db.commit()
    await db.refresh(account)
    return account

@router.get("/portfolio/summary", response_model=PortfolioSummary)
async def get_portfolio_summary(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user)
):
    """获取投资组合资金摘要"""
    # 获取现金账户
    cash_stmt = select(CashAccount).where(
        CashAccount.user_id == user.id,
        CashAccount.is_active == True
    )
    cash_result = await db.execute(cash_stmt)
    cash_accounts = cash_result.scalars().all()
    
    total_cash = sum(float(acc.balance) for acc in cash_accounts)
    
    # 获取资产投资规划
    asset_stmt = select(
        func.sum(Asset.planned_investment).label("total_planned"),
        func.sum(Asset.actual_investment).label("total_actual")
    ).where(
        Asset.user_id == user.id,
        Asset.zone.in_(["active", "base"])  # 只统计交易型资产
    )
    asset_result = await db.execute(asset_stmt)
    asset_data = asset_result.one()
    
    total_planned = float(asset_data.total_planned or 0)
    total_actual = float(asset_data.total_actual or 0)
    
    return PortfolioSummary(
        total_cash=total_cash,
        total_planned_investment=total_planned,
        total_actual_investment=total_actual,
        remaining_cash=total_cash - total_planned,
        cash_accounts=cash_accounts
    )