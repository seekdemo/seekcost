"""标签 API — 板块/主题标签 CRUD + 资产绑定"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, insert, delete as sa_delete
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.tag import Tag, asset_tags
from app.models.asset import Asset
from app.schemas.tag import TagCreate, TagUpdate, TagOut

router = APIRouter(prefix="/tags", tags=["标签"])


@router.get("", response_model=list[TagOut])
@router.get("/", response_model=list[TagOut], include_in_schema=False)
async def list_tags(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """获取用户所有标签（含关联资产数）"""
    stmt = (
        select(
            Tag,
            func.count(asset_tags.c.asset_id).label("asset_count"),
        )
        .outerjoin(asset_tags, Tag.id == asset_tags.c.tag_id)
        .where(Tag.user_id == user.id)
        .group_by(Tag.id)
        .order_by(Tag.name)
    )
    rows = await db.execute(stmt)
    result = []
    for tag, count in rows.all():
        result.append(TagOut(
            id=tag.id, name=tag.name, color=tag.color,
            created_at=tag.created_at, asset_count=count,
        ))
    return result


@router.post("", response_model=TagOut, status_code=201)
@router.post("/", response_model=TagOut, status_code=201, include_in_schema=False)
async def create_tag(body: TagCreate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """创建标签"""
    # 检查重名
    exists = await db.execute(
        select(Tag).where(Tag.user_id == user.id, Tag.name == body.name.strip())
    )
    if exists.scalars().first():
        raise HTTPException(400, f"标签 '{body.name}' 已存在")

    tag = Tag(user_id=user.id, name=body.name.strip(), color=body.color)
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return TagOut(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at, asset_count=0)


@router.patch("/{tag_id}", response_model=TagOut)
async def update_tag(tag_id: int, body: TagUpdate, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """更新标签"""
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "标签不存在")
    if body.name is not None:
        # 检查重名
        exists = await db.execute(
            select(Tag).where(Tag.user_id == user.id, Tag.name == body.name.strip(), Tag.id != tag_id)
        )
        if exists.scalars().first():
            raise HTTPException(400, f"标签 '{body.name}' 已存在")
        tag.name = body.name.strip()
    if body.color is not None:
        tag.color = body.color
    await db.commit()
    await db.refresh(tag)
    # 查资产数
    cnt = await db.execute(select(func.count()).select_from(asset_tags).where(asset_tags.c.tag_id == tag_id))
    return TagOut(id=tag.id, name=tag.name, color=tag.color, created_at=tag.created_at, asset_count=cnt.scalar() or 0)


@router.delete("/{tag_id}", status_code=204)
async def delete_tag(tag_id: int, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    """删除标签"""
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "标签不存在")
    await db.delete(tag)
    await db.commit()


# ---- 资产-标签 绑定/解绑 ----

@router.post("/{tag_id}/assets/{asset_id}", status_code=200)
async def add_tag_to_asset(
    tag_id: int, asset_id: int,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """给资产打标签"""
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "标签不存在")
    asset = await db.get(Asset, asset_id)
    if not asset or asset.user_id != user.id:
        raise HTTPException(404, "资产不存在")

    # 检查是否已关联
    exists = await db.execute(
        select(asset_tags).where(
            asset_tags.c.asset_id == asset_id,
            asset_tags.c.tag_id == tag_id,
        )
    )
    if not exists.first():
        await db.execute(
            insert(asset_tags).values(asset_id=asset_id, tag_id=tag_id)
        )
        await db.commit()
    return {"message": "ok"}


@router.delete("/{tag_id}/assets/{asset_id}", status_code=200)
async def remove_tag_from_asset(
    tag_id: int, asset_id: int,
    db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user),
):
    """移除资产标签"""
    tag = await db.get(Tag, tag_id)
    if not tag or tag.user_id != user.id:
        raise HTTPException(404, "标签不存在")

    await db.execute(
        sa_delete(asset_tags).where(
            asset_tags.c.asset_id == asset_id,
            asset_tags.c.tag_id == tag_id,
        )
    )
    await db.commit()
    return {"message": "ok"}