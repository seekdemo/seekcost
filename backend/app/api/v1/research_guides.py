"""Private structured research; editorial prompts are not AI investment analysis."""
from datetime import timezone
from typing import Literal
from urllib.parse import urlparse
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.watchlist import WatchStock
from app.models.note import Note, ResearchLink
from app.models.research_guide import ResearchGuide

router = APIRouter(prefix='/research-guides', tags=['公司研究室'])
Key = Literal['business', 'customers', 'financials', 'risks', 'valuation', 'judgment']
TITLES = {'business': '公司怎样赚钱', 'customers': '客户为什么选择它', 'financials': '经营与现金流', 'risks': '反面证据与风险', 'valuation': '价格背后的假设', 'judgment': '我的判断与改变条件'}


class StrictBody(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)


class Evidence(StrictBody):
    title: str = Field(min_length=1, max_length=200)
    url: str = Field(default='', max_length=2000)
    excerpt: str = Field(default='', max_length=3000)
    period: str = Field(default='', max_length=100)

    @field_validator('url')
    @classmethod
    def safe_url(cls, value):
        if value:
            parsed = urlparse(value)
            if parsed.scheme not in ('http', 'https') or not parsed.hostname or parsed.username or any(c.isspace() for c in value):
                raise ValueError('请使用完整的 HTTP(S) 来源链接')
        return value


class Answer(StrictBody):
    text: str = Field(default='', max_length=6000)
    status: Literal['thinking', 'unknown', 'answered'] = 'thinking'
    uncertainty: str = Field(default='', max_length=3000)
    evidence: list[Evidence] = Field(default_factory=list, max_length=8)


class SaveBody(StrictBody):
    version: int = Field(ge=0)
    step: int = Field(ge=0, le=6)
    mode: Literal['guided', 'independent'] = 'guided'
    answers: dict[Key, Answer] = Field(default_factory=dict, max_length=6)


class PublishBody(StrictBody):
    version: int = Field(ge=1)
    confirmed: Literal[True]


async def own_stock(db, user, stock_id):
    stock = await db.get(WatchStock, stock_id)
    if stock is None or stock.user_id != user.id:
        raise HTTPException(404, '公司不存在或无权访问')
    return stock


async def row_for(db, user, stock_id):
    return await db.scalar(select(ResearchGuide).where(ResearchGuide.user_id == user.id, ResearchGuide.stock_id == stock_id))


def describe(row, stock_id):
    return {'stock_id': stock_id, 'version': row.version if row else 0, 'step': row.step if row else 0,
            'mode': row.mode if row else 'guided', 'answers': row.answers if row else {},
            'published_version': row.published_version if row else None, 'note_id': row.note_id if row else None,
            'updated_at': row.updated_at.replace(tzinfo=timezone.utc) if row and row.updated_at.tzinfo is None else row.updated_at if row else None}


@router.get('')
async def list_guides(response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    response.headers['Cache-Control'] = 'no-store'
    rows = (await db.scalars(select(ResearchGuide).join(WatchStock, WatchStock.id == ResearchGuide.stock_id)
                           .where(ResearchGuide.user_id == user.id, WatchStock.user_id == user.id)
                           .order_by(ResearchGuide.updated_at.desc()))).all()
    return [describe(row, row.stock_id) for row in rows]


@router.get('/{stock_id}')
async def get_guide(stock_id: int, response: Response, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    response.headers['Cache-Control'] = 'no-store'
    await own_stock(db, user, stock_id)
    return describe(await row_for(db, user, stock_id), stock_id)


@router.put('/{stock_id}')
async def save_guide(stock_id: int, body: SaveBody, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    await own_stock(db, user, stock_id)
    row = await row_for(db, user, stock_id)
    if row is None:
        if body.version != 0:
            raise HTTPException(409, '研究版本已变化，请保留文字后重新加载')
        row = ResearchGuide(user_id=user.id, stock_id=stock_id, version=0)
        db.add(row)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            raise HTTPException(409, '另一窗口已创建研究，请保留文字后重新加载')
    result = await db.execute(update(ResearchGuide).where(ResearchGuide.id == row.id, ResearchGuide.version == body.version)
                              .values(version=body.version + 1, step=body.step, mode=body.mode,
                                      answers={key: value.model_dump() for key, value in body.answers.items()})
                              .execution_options(synchronize_session=False))
    if result.rowcount != 1:
        await db.rollback()
        raise HTTPException(409, '研究已在另一窗口更新；当前文字仍保留，请复制后重新加载')
    await db.commit(); await db.refresh(row)
    return describe(row, stock_id)


def card_content(stock, answers):
    lines = [f'# {stock.symbol} · 我的公司判断', '', '> 用户确认的个人研究快照，不是系统结论或投资建议。来源由用户记录，未经平台核实。', '']
    for key, title in TITLES.items():
        answer = answers.get(key, {})
        lines.extend([f'## {title}', '', answer.get('text') or '尚未研究 / 暂不确定', '',
                      f"状态：{'待验证' if answer.get('status') != 'answered' else '已记录想法，非已验证事实'}", '',
                      f"待验证 / 改变想法的条件：{answer.get('uncertainty') or '尚未记录'}", ''])
        for evidence in answer.get('evidence', []):
            lines.extend([f"来源：{evidence['title']}（期间 / 口径：{evidence.get('period') or '未注明'}）",
                          evidence.get('url') or '未提供链接', evidence.get('excerpt') or '未记录摘录', ''])
    return '\n'.join(lines)


@router.post('/{stock_id}/publish')
async def publish_guide(stock_id: int, body: PublishBody, db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    stock = await own_stock(db, user, stock_id)
    row = await row_for(db, user, stock_id)
    if row is None or row.version != body.version:
        raise HTTPException(409, '请先保存最新研究，再确认判断卡')
    if not any(a.get('text', '').strip() or a.get('uncertainty', '').strip() for a in row.answers.values()):
        raise HTTPException(422, '请至少写下一条理解或待验证的问题；不知道也可以记录原因')
    # Compare-and-swap publication: serializes concurrent confirmation without duplicate notes.
    claimed = await db.execute(update(ResearchGuide).where(ResearchGuide.id == row.id, ResearchGuide.version == body.version,
                                  (ResearchGuide.published_version.is_(None) | (ResearchGuide.published_version != body.version)))
                               .values(published_version=body.version).execution_options(synchronize_session=False))
    if claimed.rowcount != 1:
        await db.rollback(); await db.refresh(row)
        if row.version != body.version:
            raise HTTPException(409, '研究已更新，请重新检查判断卡')
        if row.note_id and await db.get(Note, row.note_id):
            return describe(row, stock_id)
        raise HTTPException(409, '原判断卡已删除，请保存一个新版本后再确认')
    note = Note(user_id=user.id, title=f'{stock.symbol} · 公司判断 v{body.version}', kind='company',
                content=card_content(stock, row.answers), stock_symbols=[stock.symbol], tags=['公司研究室'])
    db.add(note); await db.flush()
    db.add(ResearchLink(user_id=user.id, note_id=note.id, entity_type='watch_stock', entity_id=stock_id))
    row.note_id = note.id
    await db.commit(); await db.refresh(row)
    return describe(row, stock_id)
