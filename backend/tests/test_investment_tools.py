import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.user import User


@pytest.mark.asyncio
async def test_investment_tool_directory_is_private_and_supports_crud():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="tool-owner", hashed_password="x", nickname="Owner")
        other = User(username="tool-other", hashed_password="x", nickname="Other")
        db.add_all([owner, other])
        await db.commit()
        await db.refresh(owner)
        await db.refresh(other)

    current_user = {"value": owner}

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return current_user["value"]

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post(
                "/api/v1/tools",
                json={
                    "name": "Signal Lab",
                    "url": "https://signal-lab.example",
                    "description": "Turns filings into compact decision signals.",
                    "category": "research",
                    "pricing": "freemium",
                    "tags": ["filings", "AI", "filings", "  decision  "],
                    "source_url": "https://github.com/example/signal-lab",
                    "icon_url": "https://signal-lab.example/custom.png",
                },
            )
            assert created.status_code == 201
            payload = created.json()
            assert payload["name"] == "Signal Lab"
            assert payload["icon_url"] == "https://signal-lab.example/custom.png"
            reset = await client.patch(f"/api/v1/tools/{payload['id']}", json={"icon_url": None})
            assert reset.status_code == 200 and reset.json()["icon_url"] is None
            assert payload["url"] == "https://signal-lab.example/"
            assert payload["tags"] == ["filings", "AI", "decision"]
            assert payload["starred"] is False
            tool_id = payload["id"]

            invalid_url = await client.post(
                "/api/v1/tools",
                json={"name": "Unsafe", "url": "javascript:alert(1)", "category": "other"},
            )
            assert invalid_url.status_code == 422

            duplicate = await client.post(
                "/api/v1/tools",
                json={"name": "Duplicate", "url": "https://signal-lab.example/", "category": "research"},
            )
            assert duplicate.status_code == 409

            filtered = await client.get("/api/v1/tools", params={"q": "filings", "category": "research"})
            assert [item["id"] for item in filtered.json()] == [tool_id]

            starred = await client.patch(f"/api/v1/tools/{tool_id}", json={"starred": True})
            assert starred.status_code == 200
            assert starred.json()["starred"] is True
            assert [item["id"] for item in (await client.get("/api/v1/tools", params={"starred": True})).json()] == [tool_id]

            invalid_update = await client.patch(f"/api/v1/tools/{tool_id}", json={"name": None})
            assert invalid_update.status_code == 422

            current_user["value"] = other
            assert (await client.get("/api/v1/tools")).json() == []
            assert (await client.patch(f"/api/v1/tools/{tool_id}", json={"name": "Stolen"})).status_code == 404
            assert (await client.delete(f"/api/v1/tools/{tool_id}")).status_code == 404

            current_user["value"] = owner
            deleted = await client.delete(f"/api/v1/tools/{tool_id}")
            assert deleted.status_code == 204
            assert (await client.get("/api/v1/tools")).json() == []
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
