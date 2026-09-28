import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.core.database import Base
from app.core.demo_watchlist_import import parse_sources, replace_demo_watchlist
from app.models.user import User
from app.models.watchlist import WatchStock, StockMemo
from app.models.research_guide import ResearchGuide
from app.models.sell_batch_item import SellBatchItem  # registry


def test_csv_merge_preserves_exchange_and_groups(tmp_path):
    a=tmp_path/'全部.csv'; a.write_text('代码,名称,市场,分类\nNVDA.US,Old,美股,半导体\n600519.SH,茅台,上海,消费\n',encoding='utf-8-sig')
    b=tmp_path/'futu_groups_7_csv_1. AI基础设施.csv'; b.write_text('代码,名称,市场\nNVDA.US,NVIDIA,美股\n',encoding='utf-8-sig')
    data=parse_sources([a,b])
    assert set(data)=={'NVDA','600519.SH'}
    assert data['NVDA']['name']=='NVIDIA'
    assert data['NVDA']['industries']==['半导体']
    assert data['NVDA']['concepts']==['AI基础设施']
    a.write_text('代码,名称,市场\n',encoding='utf-8')
    with pytest.raises(ValueError):parse_sources([a])
    a.write_text('Account,Amount\nprivate,100\n',encoding='utf-8')
    with pytest.raises(ValueError):parse_sources([a])


@pytest.mark.asyncio
async def test_preview_replace_repeat_and_protect_drafts(tmp_path):
    engine=create_async_engine(f"sqlite+aiosqlite:///{tmp_path/'import.db'}")
    sessions=async_sessionmaker(engine,expire_on_commit=False)
    async with engine.begin() as c:await c.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        demo=User(username='demo',hashed_password='x');other=User(username='other',hashed_password='y')
        db.add_all([demo,other]);await db.flush()
        stock=WatchStock(user_id=demo.id,symbol='NVDA',name='【演示】旧名字',fair_price=120)
        removed=WatchStock(user_id=demo.id,symbol='OLD',name='【演示】移除')
        private=WatchStock(user_id=other.id,symbol='NVDA',name='Private')
        db.add_all([stock,removed,private]);await db.flush()
        db.add(StockMemo(user_id=demo.id,stock_id=stock.id,content='【演示】虚构证据'))
        await db.commit();sid,uid,pid=stock.id,demo.id,private.id
    items={'NVDA':dict(symbol='NVDA',name='NVIDIA',sector='美股',industries=[],concepts=['AI'])}
    async with sessions() as db:
        report=await replace_demo_watchlist(db,items)
        assert report['removed']==1 and report['created']==0
    async with sessions() as db:
        assert (await db.get(WatchStock,sid)).fair_price==120
    async with sessions() as db:await replace_demo_watchlist(db,items,apply=True)
    async with sessions() as db:await replace_demo_watchlist(db,items,apply=True)
    async with sessions() as db:
        owned=(await db.scalars(select(WatchStock).where(WatchStock.user_id==uid))).all()
        assert len(owned)==1 and owned[0].id==sid and owned[0].name=='NVIDIA' and owned[0].fair_price==0
        assert (await db.get(WatchStock,pid)).name=='Private'
        assert not (await db.scalars(select(StockMemo))).all()
        db.add(ResearchGuide(user_id=uid,stock_id=sid,answers={'business':{'text':'my work'}},version=1));await db.commit()
    async with sessions() as db:
        with pytest.raises(ValueError,match='research'):await replace_demo_watchlist(db,items,apply=True)
    await engine.dispose()
