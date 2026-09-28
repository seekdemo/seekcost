import pytest
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.database import Base
from app.core.demo_data import seed_demo
from app.models.user import User
from app.models.site_content import SiteAdmin
from app.models.watchlist import WatchStock
from app.models.asset import Asset
from app.models.transaction import Transaction, TransactionType
from app.models.note import Note
from app.models.custom_alert import AlertRule


@pytest.mark.asyncio
async def test_seed_is_consistent_repeatable_and_scoped(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'demo.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        demo, other = User(username="demo",hashed_password="unchanged"), User(username="private",hashed_password="private")
        db.add_all([demo,other]); await db.flush()
        db.add(Note(user_id=other.id,title="private record",content="keep untouched"))
        await db.commit()
        result = await seed_demo(db)
        assert result["stocks"] == 8 and result["assets"] == 5 and result["notes"] == 6
        assert (await seed_demo(db))["already_seeded"] is True
        assert await db.scalar(select(func.count()).select_from(WatchStock)) == 8
        assert await db.scalar(select(func.count()).select_from(Note).where(Note.user_id==demo.id)) == 6
        assert (await db.scalar(select(Note).where(Note.user_id==other.id))).content == "keep untouched"
        assert (await db.get(User,demo.id)).hashed_password == "unchanged"
        assert await db.get(SiteAdmin,demo.id) is None
        assert all(not rule.enabled for rule in (await db.scalars(select(AlertRule))).all())
        assets = (await db.scalars(select(Asset))).all()
        for asset in assets:
            transactions = (await db.scalars(select(Transaction).where(Transaction.asset_id==asset.id))).all()
            net = sum(float(tx.quantity)*(1 if tx.tx_type==TransactionType.BUY else -1) for tx in transactions)
            assert net == float(asset.quantity)
    await engine.dispose()


@pytest.mark.asyncio
@pytest.mark.parametrize("condition", ["missing", "admin", "conflict"])
async def test_seed_refuses_unsafe_targets(tmp_path, condition):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'guard.db'}")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with sessions() as db:
        if condition != "missing":
            demo=User(username="demo",hashed_password="unchanged"); db.add(demo); await db.flush()
            db.add(SiteAdmin(user_id=demo.id) if condition=="admin" else WatchStock(user_id=demo.id,symbol="NVDA",name="User-owned existing record"))
        await db.commit()
        with pytest.raises(ValueError):
            await seed_demo(db)
        assert await db.scalar(select(func.count()).select_from(Note)) == 0
        if condition=="conflict":
            assert (await db.scalar(select(WatchStock))).name == "User-owned existing record"
    await engine.dispose()
