"""交易计划 CRUD API"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.asset import Asset
from app.models.trade_plan import TradePlan
from app.schemas.trade_plan import TradePlanCreate, TradePlanUpdate, TradePlanOut

router = APIRouter(prefix="/trade-plans", tags=["交易计划"])


@router.get("", response_model=list[TradePlanOut])
async def list_plans(
    asset_id: int | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = select(TradePlan).join(Asset).where(Asset.user_id == user.id)
    if asset_id:
        stmt = stmt.where(TradePlan.asset_id == asset_id)
    stmt = stmt.order_by(TradePlan.created_at.desc())
    result = await db.execute(stmt)
    return result.scalars().all()


@router.post("", response_model=TradePlanOut, status_code=201)
async def create_plan(
    body: TradePlanCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    asset = await db.get(Asset, body.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "资产不存在")
    plan = TradePlan(**body.model_dump())
    db.add(plan)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.put("/{plan_id}", response_model=TradePlanOut)
async def update_plan(
    plan_id: int,
    body: TradePlanUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = await db.get(TradePlan, plan_id)
    if not plan:
        raise HTTPException(404, "计划不存在")
    asset = await db.get(Asset, plan.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "计划不存在")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(plan, field, value)
    await db.commit()
    await db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
async def delete_plan(
    plan_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    plan = await db.get(TradePlan, plan_id)
    if not plan:
        raise HTTPException(404, "计划不存在")
    asset = await db.get(Asset, plan.asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "计划不存在")
    await db.delete(plan)
    await db.commit()