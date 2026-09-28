"""财务管理 API — 工资配置 / 收入记录 / 负债 / 净资产"""
import asyncio
from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func as sqlfunc
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.salary_config import SalaryConfig, TaxCountry
from app.models.income_record import IncomeRecord, IncomeSource
from app.models.liability import Liability, LiabilityType
from app.models.asset import Asset, AssetZone
from app.schemas.finance import (
    SalaryConfigCreate, SalaryConfigUpdate, SalaryConfigOut,
    SalaryPreviewReq, SalaryPreviewOut,
    IncomeRecordCreate, IncomeRecordOut,
    LiabilityCreate, LiabilityUpdate, LiabilityOut,
    NetWorthOverview,
)
from app.services.tax_engine import calc_cn_salary, calc_us_salary, calc_custom_salary
from app.core.exchange_rate import async_get_all_rates_to_cny, get_currency_for_market

router = APIRouter(prefix="/finance", tags=["财务管理"])


# ═══════════════════ 工资配置 ═══════════════════

@router.get("/salary", response_model=SalaryConfigOut | None)
async def get_salary_config(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(SalaryConfig).where(SalaryConfig.user_id == user.id, SalaryConfig.is_active == True).limit(1)
    result = await db.execute(stmt)
    return result.scalar_one_or_none()


@router.post("/salary", response_model=SalaryConfigOut, status_code=201)
async def create_salary_config(body: SalaryConfigCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    # 停用旧配置
    old_stmt = select(SalaryConfig).where(SalaryConfig.user_id == user.id, SalaryConfig.is_active == True)
    old = await db.execute(old_stmt)
    for cfg in old.scalars().all():
        cfg.is_active = False

    config = SalaryConfig(user_id=user.id, **body.model_dump())
    db.add(config)
    await db.commit()
    await db.refresh(config)
    return config


@router.patch("/salary/{config_id}", response_model=SalaryConfigOut)
async def update_salary_config(config_id: int, body: SalaryConfigUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    config = await db.get(SalaryConfig, config_id)
    if not config or config.user_id != user.id:
        raise HTTPException(status_code=404, detail="配置不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(config, field, value)
    await db.commit()
    await db.refresh(config)
    return config


# ═══════════════════ 工资预览 ═══════════════════

@router.post("/salary/preview", response_model=SalaryPreviewOut)
async def preview_salary(body: SalaryPreviewReq):
    """预览税后收入（不保存）"""
    if body.country == "cn":
        r = calc_cn_salary(
            gross=body.gross_salary, month_index=body.month_index,
            pension_rate=body.pension_rate, medical_rate=body.medical_rate,
            unemployment_rate=body.unemployment_rate, housing_fund_rate=body.housing_fund_rate,
            special_deduction=body.special_deduction,
        )
    elif body.country == "us":
        r = calc_us_salary(body.gross_salary)
    else:
        r = calc_custom_salary(
            gross=body.gross_salary,
            custom_tax_rate=body.custom_tax_rate,
            custom_deductions=body.custom_deductions,
            custom_brackets=body.custom_brackets,
        )
    return SalaryPreviewOut(gross=r.gross, social_insurance=r.social_insurance,
                            housing_fund=r.housing_fund, tax=r.tax, net=r.net)


# ═══════════════════ 收入记录 ═══════════════════

@router.get("/income", response_model=list[IncomeRecordOut])
async def list_income(year: int | None = None, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(IncomeRecord).where(IncomeRecord.user_id == user.id)
    if year:
        stmt = stmt.where(IncomeRecord.month.like(f"{year}-%"))
    stmt = stmt.order_by(IncomeRecord.month.desc(), IncomeRecord.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/income", response_model=IncomeRecordOut, status_code=201)
async def create_income(body: IncomeRecordCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    record = IncomeRecord(user_id=user.id, **body.model_dump())
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


@router.delete("/income/{record_id}", status_code=204)
async def delete_income(record_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    record = await db.get(IncomeRecord, record_id)
    if not record or record.user_id != user.id:
        raise HTTPException(status_code=404, detail="记录不存在")
    await db.delete(record)
    await db.commit()


@router.post("/income/auto-generate", response_model=IncomeRecordOut)
async def auto_generate_income(
    month: str = Query(..., description="YYYY-MM"),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """根据当前工资配置自动生成指定月份的收入记录"""
    # 获取活跃配置
    stmt = select(SalaryConfig).where(SalaryConfig.user_id == user.id, SalaryConfig.is_active == True).limit(1)
    result = await db.execute(stmt)
    config = result.scalar_one_or_none()
    if not config:
        raise HTTPException(status_code=400, detail="请先配置工资信息")

    # 检查是否已存在
    exists_stmt = select(IncomeRecord).where(
        IncomeRecord.user_id == user.id,
        IncomeRecord.month == month,
        IncomeRecord.is_auto == True,
        IncomeRecord.source == IncomeSource.SALARY,
    ).limit(1)
    exists = await db.execute(exists_stmt)
    if exists.scalar_one_or_none():
        raise HTTPException(status_code=409, detail=f"{month} 的工资已自动生成")

    # 计算月份序号（用于中国累计预扣法）
    month_num = int(month.split("-")[1])
    gross = float(config.gross_salary)
    country = config.country.value

    if country == "cn":
        r = calc_cn_salary(
            gross=gross, month_index=month_num,
            pension_rate=float(config.pension_rate),
            medical_rate=float(config.medical_rate),
            unemployment_rate=float(config.unemployment_rate),
            housing_fund_rate=float(config.housing_fund_rate),
            special_deduction=float(config.special_deduction),
        )
    elif country == "us":
        r = calc_us_salary(gross)
    else:
        r = calc_custom_salary(
            gross=gross,
            custom_tax_rate=float(config.custom_tax_rate) if config.custom_tax_rate else None,
            custom_deductions=float(config.custom_deductions) if config.custom_deductions else None,
            custom_brackets=config.custom_brackets,
        )

    record = IncomeRecord(
        user_id=user.id, salary_config_id=config.id,
        source=IncomeSource.SALARY,
        gross_amount=r.gross, net_amount=r.net,
        tax=r.tax, social_insurance=r.social_insurance,
        housing_fund=r.housing_fund, month=month,
        is_auto=True, note="自动生成",
    )
    db.add(record)
    await db.commit()
    await db.refresh(record)
    return record


# ═══════════════════ 负债管理 ═══════════════════

@router.get("/liabilities", response_model=list[LiabilityOut])
async def list_liabilities(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stmt = select(Liability).where(Liability.user_id == user.id).order_by(Liability.remaining_amount.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("/liabilities", response_model=LiabilityOut, status_code=201)
async def create_liability(body: LiabilityCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    liability = Liability(user_id=user.id, **body.model_dump(), profit_repaid=0)
    db.add(liability)
    await db.commit()
    await db.refresh(liability)
    return liability


@router.patch("/liabilities/{lid}", response_model=LiabilityOut)
async def update_liability(lid: int, body: LiabilityUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = await db.get(Liability, lid)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="负债不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(item, field, value)
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/liabilities/{lid}", status_code=204)
async def delete_liability(lid: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    item = await db.get(Liability, lid)
    if not item or item.user_id != user.id:
        raise HTTPException(status_code=404, detail="负债不存在")
    await db.delete(item)
    await db.commit()


# ═══════════════════ 净资产概览 ═══════════════════

@router.get("/net-worth", response_model=NetWorthOverview)
async def get_net_worth(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """计算净资产概览（所有资产按汇率统一换算为 CNY）"""
    # 获取实时汇率
    rates = await async_get_all_rates_to_cny()

    # 资产
    assets_stmt = select(Asset).where(Asset.user_id == user.id)
    assets_result = await db.execute(assets_stmt)
    all_assets = assets_result.scalars().all()

    breakdown: dict[str, float] = {"active": 0, "base": 0, "invest": 0}
    total_assets = 0.0
    for a in all_assets:
        zone = a.zone.value
        market = a.market or "other"
        currency = get_currency_for_market(market)
        rate = rates.get(currency, 1.0)

        if zone == "invest":
            val = float(a.total_invested) * rate
        elif float(a.current_price) > 0:
            val = float(a.current_price) * float(a.quantity) * rate
        else:
            val = float(a.broker_cost) * float(a.quantity) * rate
        breakdown[zone] = breakdown.get(zone, 0) + val
        total_assets += val

    # 负债
    liab_stmt = select(Liability).where(Liability.user_id == user.id)
    liab_result = await db.execute(liab_stmt)
    total_liab = sum(float(l.remaining_amount) for l in liab_result.scalars().all())

    # 收入
    now = date.today()
    cur_month = now.strftime("%Y-%m")
    cur_year = now.year

    month_stmt = select(sqlfunc.coalesce(sqlfunc.sum(IncomeRecord.net_amount), 0)).where(
        IncomeRecord.user_id == user.id, IncomeRecord.month == cur_month)
    monthly_income = (await db.execute(month_stmt)).scalar() or 0

    year_stmt = select(sqlfunc.coalesce(sqlfunc.sum(IncomeRecord.net_amount), 0)).where(
        IncomeRecord.user_id == user.id, IncomeRecord.month.like(f"{cur_year}-%"))
    yearly_income = (await db.execute(year_stmt)).scalar() or 0

    return NetWorthOverview(
        total_assets=round(total_assets, 2),
        total_liabilities=round(total_liab, 2),
        net_worth=round(total_assets - total_liab, 2),
        asset_breakdown=breakdown,
        monthly_income=float(monthly_income),
        yearly_income=float(yearly_income),
        exchange_rates=rates,
    )