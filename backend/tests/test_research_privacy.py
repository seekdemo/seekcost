import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.note import Note, NoteVisibility
from app.models.user import User
from app.models.watchlist import WatchStock


def test_retired_public_and_social_routes_are_absent():
    route_paths = {route.path for route in app.routes}
    assert not any(path.startswith("/api/v1/shares") for path in route_paths)
    assert not any(path.startswith("/api/v1/social") for path in route_paths)
    assert "/api/v1/ws/notifications" not in route_paths


@pytest.mark.asyncio
async def test_research_is_owner_only_and_legacy_feed_is_gone():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="owner", hashed_password="x", nickname="Owner")
        other = User(username="other", hashed_password="x", nickname="Other")
        db.add_all([owner, other])
        await db.flush()
        note = Note(user_id=owner.id, title="曾经公开", content="private thesis", visibility=NoteVisibility.PUBLIC)
        db.add(note)
        await db.commit()
        await db.refresh(note)

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
            assert (await client.get(f"/api/v1/notes/{note.id}")).status_code == 200
            current_user["value"] = other
            assert (await client.get(f"/api/v1/notes/{note.id}")).status_code == 404
            assert (await client.get("/api/v1/notes/feed")).status_code == 410
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_legacy_visibility_is_normalized_to_private():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        user = User(username="owner", hashed_password="x", nickname="Owner")
        db.add(user)
        await db.commit()
        await db.refresh(user)

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return user

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            created = await client.post("/api/v1/notes", json={"title": "legacy", "visibility": "public"})
            assert created.status_code == 201
            assert created.json()["visibility"] == "private"
            series = await client.post("/api/v1/notes/series", json={"name": "legacy", "visibility": "workspace"})
            assert series.status_code == 201
            assert series.json()["visibility"] == "private"
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


@pytest.mark.asyncio
async def test_topics_comments_and_investment_links_are_owner_scoped():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="owner-links", hashed_password="x", nickname="Owner")
        other = User(username="other-links", hashed_password="x", nickname="Other")
        db.add_all([owner, other])
        await db.flush()
        owner_stock = WatchStock(user_id=owner.id, symbol="OWN", name="Owner stock")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER", name="Other stock")
        db.add_all([owner_stock, other_stock])
        await db.commit()
        await db.refresh(owner_stock)
        await db.refresh(other_stock)

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
            series = await client.post("/api/v1/notes/series", json={"name": "Owner topic"})
            assert series.status_code == 201
            note = await client.post(
                "/api/v1/notes",
                json={
                    "title": "Linked research",
                    "series_id": series.json()["id"],
                    "links": [{"entity_type": "watch_stock", "entity_id": owner_stock.id}],
                },
            )
            assert note.status_code == 201
            comment = await client.post(f"/api/v1/notes/{note.json()['id']}/comments", json={"content": "复核记录"})
            assert comment.status_code == 201

            cross_link = await client.post(
                "/api/v1/notes",
                json={"title": "Rejected link", "links": [{"entity_type": "watch_stock", "entity_id": other_stock.id}]},
            )
            assert cross_link.status_code == 400

            current_user["value"] = other
            assert (await client.get(f"/api/v1/notes/series/{series.json()['id']}")).status_code == 404
            assert (await client.get(f"/api/v1/notes/{note.json()['id']}/comments")).status_code == 404
            assert (await client.post(f"/api/v1/notes/{note.json()['id']}/comments", json={"content": "not allowed"})).status_code == 404
            assert (await client.get("/api/v1/notes/series/feed")).status_code == 410
            assert (await client.get("/api/v1/notes/favorites/notes")).status_code == 410
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
