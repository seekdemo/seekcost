from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlalchemy import select, func, update, delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.watchlist import WatchStock
from app.models.custom_alert import AlertRule, AlertNotification, AlertRuleState
from app.schemas.custom_alert import AlertRuleWrite

router = APIRouter(prefix="/alerts", tags=["自定义提醒"])


def record(row):
    result = {column.name: getattr(row, column.name) for column in row.__table__.columns}
    for key, value in result.items():
        if isinstance(value, datetime) and value.tzinfo is None:
            result[key] = value.replace(tzinfo=timezone.utc)
    return result


async def owned_stock(db, user_id, stock_id):
    stock = await db.scalar(select(WatchStock).where(WatchStock.id == stock_id, WatchStock.user_id == user_id))
    if not stock:
        raise HTTPException(404, "自选股不存在")
    return stock


async def owned_rule(db, user_id, rule_id):
    rule = await db.scalar(select(AlertRule).where(AlertRule.id == rule_id, AlertRule.user_id == user_id))
    if not rule:
        raise HTTPException(404, "提醒规则不存在")
    return rule


async def describe_rule(db, rule, stocks=None):
    if stocks is None:
        stocks = {stock.id: stock for stock in (await db.scalars(select(WatchStock).where(WatchStock.user_id == rule.user_id))).all()}
    result = record(rule)
    stock = stocks.get(rule.stock_id)
    result.update(symbol=stock.symbol if stock else "", stock_name=stock.name if stock else "",
                  target_count=len(stocks) if rule.scope == "watchlist" else int(stock is not None))
    if rule.scope == "watchlist":
        states = list((await db.scalars(select(AlertRuleState).where(AlertRuleState.rule_id == rule.id,
                                                                   AlertRuleState.stock_id.in_(list(stocks))))).all())
        result.update(checked_count=sum(state.checked_at is not None for state in states),
                      inside_count=sum(state.status == "inside" for state in states),
                      unavailable_count=sum(state.status not in ("inside", "outside", "pending") for state in states),
                      checked_at=max((state.checked_at for state in states if state.checked_at), default=None),
                      last_triggered_at=max((state.last_triggered_at for state in states if state.last_triggered_at), default=None),
                      status="watching" if any(state.checked_at for state in states) else "pending", evidence=None)
        for key in ("checked_at", "last_triggered_at"):
            if result[key] and result[key].tzinfo is None:
                result[key] = result[key].replace(tzinfo=timezone.utc)
    return result


@router.get("/rules")
async def rules(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stocks = {stock.id: stock for stock in (await db.scalars(select(WatchStock).where(WatchStock.user_id == user.id))).all()}
    rows = (await db.scalars(select(AlertRule).where(AlertRule.user_id == user.id).order_by(AlertRule.id.desc()))).all()
    return [await describe_rule(db, rule, stocks) for rule in rows if rule.scope == "watchlist" or rule.stock_id in stocks]


@router.post("/rules", status_code=201)
async def create_rule(body: AlertRuleWrite, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    if body.scope == "single":
        await owned_stock(db, user.id, body.stock_id)
    count = await db.scalar(select(func.count()).select_from(AlertRule).where(AlertRule.user_id == user.id))
    if count >= 100:
        raise HTTPException(400, "最多可创建 100 条提醒规则")
    rule = AlertRule(user_id=user.id, **body.model_dump())
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return await describe_rule(db, rule)


@router.put("/rules/{rule_id}")
async def edit_rule(rule_id: int, body: AlertRuleWrite, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rule = await owned_rule(db, user.id, rule_id)
    if body.scope == "single":
        await owned_stock(db, user.id, body.stock_id)
    rearm = any(getattr(rule, key) != getattr(body, key) for key in ("scope", "stock_id", "period", "tolerance", "side", "enabled"))
    old_scope, old_stock, old_triggered = rule.scope, rule.stock_id, rule.last_triggered_at
    changes = {**body.model_dump(), "version": rule.version + 1}
    if rearm:
        changes.update(inside=None, status="pending", checked_at=None, evidence=None)
    if old_scope == "watchlist" and body.scope == "single":
        state = await db.scalar(select(AlertRuleState).where(AlertRuleState.rule_id == rule.id, AlertRuleState.stock_id == body.stock_id))
        changes["last_triggered_at"] = state.last_triggered_at if state else None
    result = await db.execute(update(AlertRule).where(AlertRule.id == rule.id, AlertRule.version == rule.version).values(**changes))
    if result.rowcount != 1:
        raise HTTPException(409, "规则刚刚更新，请刷新后重试")
    if rearm:
        await db.execute(update(AlertRuleState).where(AlertRuleState.rule_id == rule.id)
                         .values(inside=None, status="pending", checked_at=None, evidence=None, version=AlertRuleState.version + 1))
    if old_scope == "single" and body.scope == "watchlist" and old_stock is not None:
        state = await db.scalar(select(AlertRuleState).where(AlertRuleState.rule_id == rule.id, AlertRuleState.stock_id == old_stock))
        if state:
            state.last_triggered_at = old_triggered
        else:
            db.add(AlertRuleState(rule_id=rule.id, stock_id=old_stock, last_triggered_at=old_triggered))
    await db.commit()
    await db.refresh(rule)
    return await describe_rule(db, rule)


@router.delete("/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    rule = await owned_rule(db, user.id, rule_id)
    await db.execute(update(AlertNotification).where(AlertNotification.rule_id == rule.id, AlertNotification.user_id == user.id).values(rule_id=None))
    await db.execute(delete(AlertRuleState).where(AlertRuleState.rule_id == rule.id))
    await db.delete(rule)
    await db.commit()
    return Response(status_code=204)


@router.get("/notifications")
async def notifications(unread: bool = False, before: int | None = None, limit: int = Query(30, ge=1, le=100),
                        db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    query = select(AlertNotification).where(AlertNotification.user_id == user.id)
    if unread:
        query = query.where(AlertNotification.read_at.is_(None))
    if before is not None:
        query = query.where(AlertNotification.id < before)
    rows = list((await db.scalars(query.order_by(AlertNotification.id.desc()).limit(limit + 1))).all())
    count = await db.scalar(select(func.count()).select_from(AlertNotification).where(AlertNotification.user_id == user.id, AlertNotification.read_at.is_(None)))
    return {"items": [record(row) for row in rows[:limit]], "unread_count": count,
            "next_cursor": rows[limit - 1].id if len(rows) > limit else None}


@router.post("/notifications/read-all")
async def read_all(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await db.execute(update(AlertNotification).where(AlertNotification.user_id == user.id, AlertNotification.read_at.is_(None)).values(read_at=datetime.now(timezone.utc)))
    await db.commit()
    return {"ok": True}


@router.post("/notifications/{notification_id}/read")
async def read_one(notification_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    note = await db.scalar(select(AlertNotification).where(AlertNotification.id == notification_id, AlertNotification.user_id == user.id))
    if not note:
        raise HTTPException(404, "通知不存在")
    if note.read_at is None:
        note.read_at = datetime.now(timezone.utc)
        await db.commit()
    return {"ok": True}
