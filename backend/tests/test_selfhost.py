import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker

from app.core.config import Settings, get_settings
from app.core.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.site_content import SiteAdmin


def test_production_rejects_example_secrets():
    for secret in ("dev-only-change-me", "replace-with-a-random-string-at-least-32-characters"):
        with pytest.raises(ValueError):
            Settings(_env_file=None, APP_ENV="production", SECRET_KEY=secret)


@pytest.mark.asyncio
async def test_closed_registration_and_explicit_owner(tmp_path, monkeypatch):
    from app.core import owner
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'owner.db'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async def database():
        async with sessions() as db:
            yield db
    app.dependency_overrides[get_db] = database
    monkeypatch.setattr(get_settings(), "ALLOW_REGISTRATION", False)
    monkeypatch.setattr(owner, "async_session", sessions)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.get("/api/v1/auth/registration")).json() == {"enabled": False}
            denied = await client.post("/api/v1/auth/register", json={"username": "outsider", "password": "test-password-2026"})
            assert denied.status_code == 403
        async with sessions() as db:
            assert (await db.scalars(select(User))).all() == []
        await owner.create_owner("myowner", "test-password-2026")
        async with sessions() as db:
            user = (await db.scalars(select(User))).one()
            assert user.hashed_password != "test-password-2026"
            assert await db.get(SiteAdmin, user.id) is not None
        with pytest.raises(ValueError, match="exists"):
            await owner.create_owner("MYOWNER", "different-password")
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_readiness_does_not_leak_database_failures(monkeypatch):
    import app.main as server

    class FailedSession:
        async def __aenter__(self):
            raise RuntimeError("database-password-must-not-leak")
        async def __aexit__(self, *args):
            pass

    monkeypatch.setattr(server, "async_session", FailedSession)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/health/ready")
        assert response.status_code == 503
        assert response.json() == {"status": "unavailable"}
        assert "password" not in response.text
