import httpx
import pytest
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.watchlist import WatchStock
from app.models.note import Note, ResearchLink


@pytest.mark.asyncio
async def test_guide_ownership_versions_validation_and_snapshots(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'guide.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        user = User(username='researcher', hashed_password='x')
        other = User(username='other', hashed_password='x')
        db.add_all([user, other]); await db.flush()
        stock = WatchStock(user_id=user.id, symbol='TEST', name='Test Company')
        foreign = WatchStock(user_id=other.id, symbol='OTHER', name='Private')
        db.add_all([stock, foreign]); await db.commit()
        uid, sid, foreign_id = user.id, stock.id, foreign.id
    async def database():
        async with sessions() as db:
            yield db
    async def current(db=Depends(get_db)):
        return await db.get(User, uid)
    app.dependency_overrides[get_db] = database
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as c:
            root = f'/api/v1/research-guides/{sid}'
            assert (await c.get(root)).status_code == 401
            app.dependency_overrides[get_current_user] = current
            assert (await c.get(f'/api/v1/research-guides/{foreign_id}')).status_code == 404
            draft = (await c.get(root)).json()
            assert draft['version'] == 0
            body = {'version': 0, 'step': 2, 'mode': 'independent', 'answers': {}}
            assert (await c.put(f'/api/v1/research-guides/{foreign_id}', json=body)).status_code == 404
            assert (await c.post(f'/api/v1/research-guides/{foreign_id}/publish', json={'version': 1, 'confirmed': True})).status_code == 404
            assert (await c.put(root, json={**body, 'step': 7})).status_code == 422
            assert (await c.put(root, json={**body, 'answers': {'unrecognized': {}}})).status_code == 422
            empty = await c.put(root, json=body)
            assert empty.status_code == 200, empty.text
            assert (await c.put(root, json=body)).status_code == 409
            assert (await c.post(root+'/publish', json={'version': 1, 'confirmed': True})).status_code == 422
            body['version'] = 1
            body['answers'] = {'business': {'text': '向企业客户销售订阅服务', 'status': 'answered', 'uncertainty': '续费率尚未核实', 'evidence': [{'title': '年报', 'url': 'javascript:alert(1)', 'excerpt': '业务介绍', 'period': '2025年'}]}}
            assert (await c.put(root, json=body)).status_code == 422
            body['answers']['business']['evidence'][0]['url'] = 'https://example.com/report'
            saved = (await c.put(root, json=body)).json()
            assert saved['version'] == 2 and saved['mode'] == 'independent'
            assert (await c.get(root)).json()['answers'] == saved['answers']
            assert len((await c.get('/api/v1/research-guides')).json()) == 1
            assert (await c.post(root+'/publish', json={'version': 2, 'confirmed': False})).status_code == 422
            result = await c.post(root+'/publish', json={'version': 2, 'confirmed': True})
            assert result.status_code == 200, result.text
            first = result.json()
            repeat = (await c.post(root+'/publish', json={'version': 2, 'confirmed': True})).json()
            assert first['note_id'] == repeat['note_id']
            body['version'] = 2
            body['answers']['business']['text'] = '更新后的理解'
            assert (await c.put(root, json=body)).status_code == 200
            assert (await c.post(root+'/publish', json={'version': 2, 'confirmed': True})).status_code == 409
            second = (await c.post(root+'/publish', json={'version': 3, 'confirmed': True})).json()
            assert second['note_id'] != first['note_id']
            async with sessions() as db:
                note = await db.get(Note, first['note_id'])
                assert note.visibility.value == 'private'
                assert '续费率尚未核实' in note.content and '尚未研究' in note.content
                assert (await db.scalars(select(ResearchLink).where(ResearchLink.note_id == note.id))).one().entity_id == sid
            assert (await c.delete(f'/api/v1/watchlist/stocks/{sid}')).status_code == 204
            assert (await c.get('/api/v1/research-guides')).json() == []
            async with sessions() as db:
                assert await db.get(Note, first['note_id']) is not None
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_migration_is_additive_and_refuses_research_loss():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, text, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1] / 'alembic/versions/b9c2d4e6f801_guided_research.py'
    spec = importlib.util.spec_from_file_location('guide_migration', path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine('sqlite://')
    with engine.begin() as conn:
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        assert 'research_guides' in inspect(conn).get_table_names()
        conn.execute(text("INSERT INTO research_guides (id,user_id,stock_id,version,step,mode,answers) VALUES (1,1,1,1,0,'guided','{}')"))
        with pytest.raises(RuntimeError, match='Refusing'):
            migration.downgrade()
        assert conn.execute(text('SELECT count(*) FROM research_guides')).scalar() == 1
        conn.execute(text('DELETE FROM research_guides'))
        migration.downgrade()
        assert 'research_guides' not in inspect(conn).get_table_names()
    engine.dispose()
