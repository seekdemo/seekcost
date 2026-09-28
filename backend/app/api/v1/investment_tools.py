"""Private investment tool directory API."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import String, cast, desc, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.investment_tool import InvestmentTool
from app.models.user import User
from app.schemas.investment_tool import InvestmentToolCreate, InvestmentToolOut, InvestmentToolUpdate

router = APIRouter(prefix="/tools", tags=["投资工具导航"])


@router.get("/icon")
async def tool_icon(url: str = Query(max_length=2048), direct: bool = False,
                    user: User = Depends(get_current_user)):
    from app.core.tool_icons import discover_icon
    return {"icon": await discover_icon(url, direct)}


async def _get_owned_tool(tool_id: int, db: AsyncSession, user: User) -> InvestmentTool:
    tool = await db.get(InvestmentTool, tool_id)
    if not tool or tool.user_id != user.id:
        raise HTTPException(status_code=404, detail="投资工具不存在")
    return tool


async def _url_exists(url: str, user: User, db: AsyncSession, exclude_id: int | None = None) -> bool:
    statement = select(InvestmentTool.id).where(InvestmentTool.user_id == user.id, InvestmentTool.url == url)
    if exclude_id is not None:
        statement = statement.where(InvestmentTool.id != exclude_id)
    return (await db.execute(statement)).scalar_one_or_none() is not None


@router.get("", response_model=list[InvestmentToolOut])
@router.get("/", response_model=list[InvestmentToolOut], include_in_schema=False)
async def list_investment_tools(
    q: str | None = Query(default=None, max_length=120),
    category: str | None = Query(default=None, max_length=32),
    starred: bool | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    statement = select(InvestmentTool).where(InvestmentTool.user_id == user.id)
    if q and q.strip():
        query = f"%{q.strip()}%"
        statement = statement.where(
            or_(
                InvestmentTool.name.ilike(query),
                InvestmentTool.description.ilike(query),
                InvestmentTool.url.ilike(query),
                cast(InvestmentTool.tags, String).ilike(query),
            )
        )
    if category:
        statement = statement.where(InvestmentTool.category == category)
    if starred is not None:
        statement = statement.where(InvestmentTool.starred == starred)
    statement = statement.order_by(desc(InvestmentTool.starred), desc(InvestmentTool.updated_at), InvestmentTool.name)
    return list((await db.execute(statement)).scalars().all())


@router.post("", response_model=InvestmentToolOut, status_code=201)
@router.post("/", response_model=InvestmentToolOut, status_code=201, include_in_schema=False)
async def create_investment_tool(
    body: InvestmentToolCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    data = body.model_dump(mode="json")
    data["url"] = str(data["url"])
    if data.get("source_url"):
        data["source_url"] = str(data["source_url"])
    if await _url_exists(data["url"], user, db):
        raise HTTPException(status_code=409, detail="这个地址已经收录")
    tool = InvestmentTool(user_id=user.id, **data)
    db.add(tool)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="这个地址已经收录") from None
    await db.refresh(tool)
    return tool


@router.patch("/{tool_id}", response_model=InvestmentToolOut)
async def update_investment_tool(
    tool_id: int,
    body: InvestmentToolUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tool = await _get_owned_tool(tool_id, db, user)
    data = body.model_dump(exclude_unset=True, mode="json")
    if "url" in data:
        data["url"] = str(data["url"])
        if await _url_exists(data["url"], user, db, exclude_id=tool_id):
            raise HTTPException(status_code=409, detail="这个地址已经收录")
    if "source_url" in data and data["source_url"]:
        data["source_url"] = str(data["source_url"])
    for key, value in data.items():
        setattr(tool, key, value)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="这个地址已经收录") from None
    await db.refresh(tool)
    return tool


@router.delete("/{tool_id}", status_code=204)
async def delete_investment_tool(
    tool_id: int,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tool = await _get_owned_tool(tool_id, db, user)
    await db.delete(tool)
    await db.commit()
