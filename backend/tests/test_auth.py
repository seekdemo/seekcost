import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.main import app


@pytest.mark.asyncio
async def test_username_registration_and_login_are_the_only_auth_flows():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async def override_db():
        async with sessions() as db:
            yield db

    app.dependency_overrides[get_db] = override_db
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            registered = await client.post(
                "/api/v1/auth/register",
                json={"username": "researcher_01", "password": "strong-pass-01", "nickname": "研究者"},
            )
            assert registered.status_code == 201
            token = registered.json()["access_token"]

            profile = await client.get(
                "/api/v1/auth/me",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert profile.status_code == 200
            assert profile.json()["username"] == "researcher_01"
            assert "email" not in profile.json()

            duplicate = await client.post(
                "/api/v1/auth/register",
                json={"username": "RESEARCHER_01", "password": "strong-pass-02"},
            )
            assert duplicate.status_code == 409

            logged_in = await client.post(
                "/api/v1/auth/login",
                json={"username": "Researcher_01", "password": "strong-pass-01"},
            )
            assert logged_in.status_code == 200
            assert logged_in.json()["access_token"]

            wrong_password = await client.post(
                "/api/v1/auth/login",
                json={"username": "researcher_01", "password": "wrong-password"},
            )
            assert wrong_password.status_code == 401

            auth_routes = {
                route.path
                for route in app.routes
                if route.path.startswith("/api/v1/auth/")
            }
            assert auth_routes == {
                "/api/v1/auth/register",
                "/api/v1/auth/login",
                "/api/v1/auth/me",
                "/api/v1/auth/profile",
                "/api/v1/auth/change-password",
            }
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_registration_rejects_invalid_usernames_and_short_passwords():
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        invalid_username = await client.post(
            "/api/v1/auth/register",
            json={"username": "含空格 用户", "password": "strong-pass-01"},
        )
        short_password = await client.post(
            "/api/v1/auth/register",
            json={"username": "valid_user", "password": "short"},
        )
    assert invalid_username.status_code == 422
    assert short_password.status_code == 422
