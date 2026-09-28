import httpx
import pytest
from fastapi import Depends
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.models.user import User
from app.models.site_content import SiteAdmin


@pytest.mark.asyncio
async def test_content_access_drafts_publication_conflicts_and_revocation(tmp_path):
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'content.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        user = User(username="editor", hashed_password="x")
        db.add(user); await db.commit()
        uid = user.id
    async def database():
        async with sessions() as db:
            yield db
    async def current_user(db=Depends(get_db)):
        return await db.get(User, uid)
    app.dependency_overrides[get_db] = database
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            public = (await client.get("/api/v1/content/about?locale=zh-CN")).json()
            assert "为什么" in public["content"]["mission"]
            assert (await client.get("/api/v1/admin/content/about")).status_code == 401
            app.dependency_overrides[get_current_user] = current_user
            assert (await client.get("/api/v1/admin/content/about")).status_code == 403
            assert (await client.patch("/api/v1/auth/profile", json={"role":"admin","is_admin":True})).status_code == 200
            assert (await client.get("/api/v1/admin/me")).status_code == 403
            async with sessions() as db:
                db.add(SiteAdmin(user_id=uid)); await db.commit()
            draft = (await client.get("/api/v1/admin/content/about?locale=zh-CN")).json()
            content = {**draft["draft"], "mission": "新的开发初衷，不是投资建议"}
            body = {"version": 0, "content": content}
            assert (await client.put("/api/v1/admin/content/about?locale=zh-CN", json=body)).status_code == 200
            assert (await client.get("/api/v1/content/about?locale=zh-CN")).json() == public
            assert (await client.put("/api/v1/admin/content/about?locale=zh-CN", json=body)).status_code == 409
            assert (await client.post("/api/v1/admin/content/about/publish?locale=zh-CN", json={"version": 0})).status_code == 409
            published = await client.post("/api/v1/admin/content/about/publish?locale=zh-CN", json={"version": 1})
            assert published.status_code == 200
            assert (await client.get("/api/v1/content/about?locale=zh-CN")).json()["content"] == content
            assert (await client.get("/api/v1/content/about?locale=en")).json()["content"] != content
            audit = (await client.get("/api/v1/admin/content/audit")).json()
            assert [row["action"] for row in audit] == ["publish", "save"]
            assert "hashed_password" not in str(audit)
            assert (await client.put("/api/v1/admin/content/about?locale=zh-CN", json={"version": 2, "content": {**content, "title": " "}})).status_code == 422
            assert (await client.get("/api/v1/content/about?locale=invalid")).status_code == 422
            async with sessions() as db:
                await db.delete(await db.get(SiteAdmin, uid)); await db.commit()
            assert (await client.post("/api/v1/admin/content/about/publish?locale=zh-CN", json={"version": 2})).status_code == 403
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_operator_provisioning_and_user_cleanup_preserve_public_content(tmp_path, monkeypatch):
    import app.core.site_admin as operator
    from app.core.demo_cleanup import clear_user_data
    from app.models.site_content import SiteContent, ContentAudit
    from app.core.site_content import DEFAULT_ABOUT
    from sqlalchemy import select
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'permissions.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    monkeypatch.setattr(operator, "async_session", sessions)
    with pytest.raises(SystemExit, match="User not found"):
        await operator.provision("grant", "missing")
    async with sessions() as db:
        user = User(username="named-owner", hashed_password="x")
        db.add(user);await db.commit();uid=user.id
    await operator.provision("grant", "named-owner")
    await operator.provision("grant", "named-owner")
    await operator.provision("revoke", "named-owner")
    async with sessions() as db:
        assert await db.get(SiteAdmin, uid) is None
    await operator.provision("grant", "named-owner")
    async with sessions() as db:
        db.add(SiteContent(key="about",locale="en",draft=DEFAULT_ABOUT["en"],published=DEFAULT_ABOUT["en"]))
        db.add(ContentAudit(actor_id=uid,action="publish",key="about",locale="en",version=1))
        await db.commit()
        await clear_user_data(db, "named-owner")
    async with sessions() as db:
        assert await db.get(SiteAdmin, uid) is None
        assert await db.get(SiteContent, ("about","en")) is not None
        assert (await db.scalars(select(ContentAudit).where(ContentAudit.action == "publish"))).one().actor_id is None
    await engine.dispose()


def test_content_migration_is_additive_and_refuses_data_loss():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    spec = importlib.util.spec_from_file_location("content_migration", Path(__file__).parents[1] / "alembic/versions/a7c1d3e6f9b2_site_content.py")
    migration = importlib.util.module_from_spec(spec);spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("INSERT INTO users VALUES (42)")
        migration.op = Operations(MigrationContext.configure(conn));migration.upgrade()
        assert {"site_admins","site_content","content_audit"}.issubset(inspect(conn).get_table_names())
        assert conn.exec_driver_sql("SELECT id FROM users").scalar() == 42
        conn.exec_driver_sql("INSERT INTO site_admins(user_id) VALUES(42)")
        with pytest.raises(RuntimeError, match="Refusing"):
            migration.downgrade()
    engine.dispose()
