import importlib.util
import json
from pathlib import Path

import httpx
import pytest
from sqlalchemy import inspect, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.note import Note, ResearchLink
from app.models.user import User
from app.models.watchlist import StockMemo, WatchStock
from app.models.watchlist_research import WatchResearchSectionKey, WatchStockResearchSection
from app.schemas.watchlist import WatchStockResearchProfileOut


@pytest.mark.asyncio
async def test_research_profile_has_five_sections_and_is_owner_scoped():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="research-owner", hashed_password="x")
        other = User(username="research-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        stock = WatchStock(user_id=owner.id, symbol="RESEARCH")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER")
        db.add_all([stock, other_stock])
        await db.flush()
        section = WatchStockResearchSection(
            user_id=owner.id,
            stock_id=stock.id,
            key=WatchResearchSectionKey.COMPANY_OVERVIEW,
            summary="A focused summary",
            evidence=[{"label": "Filing", "source": "https://example.test"}],
            open_questions=[{"question": "What changes next?", "status": "open"}],
        )
        db.add(section)
        await db.commit()
        await db.refresh(section)
        section.summary = "Updated summary"
        await db.commit()

        assert {item.value for item in WatchResearchSectionKey} == {
            "company_overview",
            "industry_moat",
            "growth_financials",
            "risks_invalidation",
            "valuation_decision",
        }
        assert section.summary == "Updated summary"
        assert (await db.scalar(select(WatchStockResearchSection).where(
            WatchStockResearchSection.user_id == owner.id,
            WatchStockResearchSection.stock_id == stock.id,
        ))) is not None
        assert (await db.scalar(select(WatchStockResearchSection).where(
            WatchStockResearchSection.user_id == other.id,
            WatchStockResearchSection.stock_id == stock.id,
        ))) is None
        profile = WatchStockResearchProfileOut(stock_id=stock.id, research_sections=[])
        assert profile.stock_id == stock.id
    await engine.dispose()


@pytest.mark.asyncio
async def test_research_profile_endpoints_are_private_and_keep_legacy_fields_in_sync():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="profile-owner", hashed_password="x")
        other = User(username="profile-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        stock = WatchStock(user_id=owner.id, symbol="OWN")
        other_stock = WatchStock(user_id=other.id, symbol="OTHER")
        db.add_all([stock, other_stock])
        await db.flush()
        owner_note = Note(user_id=owner.id, title="Owner research")
        other_note = Note(user_id=other.id, title="Other research")
        db.add_all([owner_note, other_note])
        await db.flush()
        db.add_all([
            StockMemo(user_id=owner.id, stock_id=stock.id, content="Owner memo"),
            StockMemo(user_id=other.id, stock_id=stock.id, content="Other memo"),
            ResearchLink(user_id=owner.id, note_id=owner_note.id, entity_type="watch_stock", entity_id=stock.id),
            ResearchLink(user_id=other.id, note_id=other_note.id, entity_type="watch_stock", entity_id=stock.id),
        ])
        await db.commit()

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
            profile = await client.get(f"/api/v1/watchlist/stocks/{stock.id}/research-profile")
            assert profile.status_code == 200
            assert {item["key"] for item in profile.json()["research_sections"]} == {
                item.value for item in WatchResearchSectionKey
            }
            assert [item["content"] for item in profile.json()["memos"]] == ["Owner memo"]
            assert [item["title"] for item in profile.json()["linked_research"]] == ["Owner research"]

            malformed = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}/research-sections/company_overview",
                json={"open_questions": [{"question": "Test", "status": "unknown"}]},
            )
            assert malformed.status_code == 422
            bad_url = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}/research-sections/company_overview",
                json={"evidence": [{"label": "Source", "url": "ftp://example.test"}]},
            )
            assert bad_url.status_code == 422

            legacy = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}",
                json={"business_summary": "Legacy summary"},
            )
            assert legacy.status_code == 200
            refreshed = await client.get(f"/api/v1/watchlist/stocks/{stock.id}/research-profile")
            overview = next(
                item for item in refreshed.json()["research_sections"] if item["key"] == "company_overview"
            )
            assert overview["summary"] == "Legacy summary"

            section = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}/research-sections/company_overview",
                json={"summary": "Section summary"},
            )
            assert section.status_code == 200
            assert section.json()["summary"] == "Section summary"
            stock_response = await client.get("/api/v1/watchlist/stocks")
            assert stock_response.json()[0]["business_summary"] == "Section summary"

            industry = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}/research-sections/industry_moat",
                json={"summary": "### Industry view\n\nLong-form moat research."},
            )
            assert industry.status_code == 200
            stock_response = await client.get("/api/v1/watchlist/stocks")
            assert stock_response.json()[0]["sector"] == ""

            classification = await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}",
                json={"sector": "Enterprise software", "industries": ["Enterprise software"]},
            )
            assert classification.status_code == 200
            refreshed = await client.get(f"/api/v1/watchlist/stocks/{stock.id}/research-profile")
            industry_section = next(
                item for item in refreshed.json()["research_sections"] if item["key"] == "industry_moat"
            )
            assert industry_section["summary"] == "### Industry view\n\nLong-form moat research."

            current_user["value"] = other
            assert (await client.get(f"/api/v1/watchlist/stocks/{stock.id}/research-profile")).status_code == 404
            assert (await client.patch(
                f"/api/v1/watchlist/stocks/{stock.id}/research-sections/company_overview",
                json={"summary": "Cross-user"},
            )).status_code == 404
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()


def test_research_sections_migration_backfill_is_idempotent():
    from alembic.migration import MigrationContext
    from alembic.operations import Operations

    migration_path = Path(__file__).parents[1] / "alembic" / "versions" / "c2d3e4f5a6b7_add_watch_stock_research_sections.py"
    spec = importlib.util.spec_from_file_location("research_migration", migration_path)
    migration = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(migration)

    # The migration only needs the legacy watch_stocks shape for this contract test.
    from sqlalchemy import create_engine

    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as connection:
        connection.execute(text("""
            CREATE TABLE users (id INTEGER PRIMARY KEY)
        """))
        connection.execute(text("""
            CREATE TABLE watch_stocks (
                id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, sector VARCHAR(256),
                industries JSON, concepts JSON, entry_reason TEXT, business_summary TEXT,
                growth_drivers TEXT, fundamental_risks TEXT, fundamental_metrics JSON,
                thesis TEXT, invalidation TEXT, fair_price NUMERIC, strike_price NUMERIC,
                target_price NUMERIC
            )
        """))
        connection.execute(text("""
            INSERT INTO watch_stocks VALUES
            (1, 1, 'Software', '["Cloud"]', '["AI"]', 'Entry reason', 'Business summary',
             'Growth drivers', 'Fundamental risks', '[{"metric":"Revenue"}]', 'Thesis',
             'Invalidation', 10, 8, 15)
        """))
        context = MigrationContext.configure(connection)
        with Operations.context(context):
            migration.upgrade()
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()
        rows = connection.execute(text(
            "SELECT key, summary, evidence FROM watch_stock_research_sections ORDER BY key"
        )).fetchall()
        assert len(rows) == 5
        values = {row[0]: (row[1], json.loads(row[2])) for row in rows}
        assert values["company_overview"][0] == "Business summary"
        assert values["growth_financials"][0] == "Growth drivers"
        assert values["risks_invalidation"][0] == "Fundamental risks"
        assert values["valuation_decision"][0] == "Thesis"
        assert values["industry_moat"][0] == "Software"
        assert any(item.get("value") == "Entry reason" for item in values["company_overview"][1])
        assert any(item.get("value") == "Invalidation" for item in values["risks_invalidation"][1])
