from datetime import datetime, timezone
from typing import Literal
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.site_content import DEFAULT_ABOUT
from app.models.user import User
from app.models.site_content import SiteAdmin, SiteContent, ContentAudit

router = APIRouter(tags=["公共内容管理"])
Locale = Literal["zh-CN", "en"]


class ContentBody(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    title: str = Field(min_length=1, max_length=120)
    intro: str = Field(min_length=1, max_length=1000)
    mission: str = Field(min_length=1, max_length=12000)
    values: str = Field(min_length=1, max_length=12000)
    roadmap: str = Field(min_length=1, max_length=12000)


class VersionBody(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: int = Field(ge=0)


class SaveBody(VersionBody):
    content: ContentBody


async def require_admin(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    if await db.get(SiteAdmin, user.id) is None:
        raise HTTPException(403, "此账户没有管理员权限，请联系平台维护者")
    return user


def describe(row, locale):
    published_at = row.published_at if row else None
    if published_at and published_at.tzinfo is None:
        published_at = published_at.replace(tzinfo=timezone.utc)
    return {"draft": row.draft if row else DEFAULT_ABOUT[locale],
            "published": row.published or DEFAULT_ABOUT[locale] if row else DEFAULT_ABOUT[locale],
            "version": row.version if row else 0,
            "published_at": published_at}


@router.get("/content/about")
async def public_content(response: Response, locale: Locale = "zh-CN", db: AsyncSession = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    row = await db.get(SiteContent, ("about", locale))
    return {"content": row.published if row and row.published else DEFAULT_ABOUT[locale],
            "published_at": row.published_at if row else None}


@router.get("/admin/me")
async def admin_me(user: User = Depends(require_admin)):
    return {"username": user.username, "role": "content_admin"}


@router.get("/admin/content/about")
async def get_content(response: Response, locale: Locale = "zh-CN", db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    response.headers["Cache-Control"] = "no-store"
    return describe(await db.get(SiteContent, ("about", locale)), locale)


async def claim(db, locale, version, changes):
    row = await db.get(SiteContent, ("about", locale))
    if row is None:
        if version != 0:
            raise HTTPException(409, "内容版本已变化，请先重新加载；未保存文字请自行保留")
        row = SiteContent(key="about", locale=locale, draft=DEFAULT_ABOUT[locale], version=0)
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, "另一位管理员已创建草稿，请重新加载")
    result = await db.execute(update(SiteContent).where(SiteContent.key == "about", SiteContent.locale == locale,
                                                      SiteContent.version == version)
                              .values(**changes, version=version + 1).execution_options(synchronize_session=False))
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, "内容版本已变化，请先重新加载；未保存文字请自行保留")
    return row


@router.put("/admin/content/about")
async def save_content(body: SaveBody, locale: Locale = "zh-CN", db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    row = await claim(db, locale, body.version, {"draft": body.content.model_dump()})
    db.add(ContentAudit(actor_id=user.id, action="save", key="about", locale=locale, version=body.version + 1))
    await db.commit(); await db.refresh(row)
    return describe(row, locale)


@router.post("/admin/content/about/publish")
async def publish_content(body: VersionBody, locale: Locale = "zh-CN", db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    row = await db.get(SiteContent, ("about", locale))
    if row is None:
        raise HTTPException(409, "请先保存草稿")
    row = await claim(db, locale, body.version, {"published": row.draft, "published_at": datetime.now(timezone.utc)})
    db.add(ContentAudit(actor_id=user.id, action="publish", key="about", locale=locale, version=body.version + 1))
    await db.commit(); await db.refresh(row)
    return describe(row, locale)


@router.get("/admin/content/audit")
async def content_audit(db: AsyncSession = Depends(get_db), user: User = Depends(require_admin)):
    rows = (await db.scalars(select(ContentAudit).order_by(ContentAudit.id.desc()).limit(50))).all()
    return [{"id": r.id, "actor_id": r.actor_id, "action": r.action, "key": r.key, "locale": r.locale,
             "version": r.version, "created_at": r.created_at.replace(tzinfo=timezone.utc) if r.created_at.tzinfo is None else r.created_at} for r in rows]
