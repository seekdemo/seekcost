import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.api.v1 import watchlist as watchlist_api
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.core.watchlist_classifier import (
    category_name_from_filename,
    normalize_classification_symbol,
    parse_classification_file,
)
from app.main import app
from app.models.user import User
from app.models.watchlist import WatchStock


def test_classification_parser_supports_futu_names_suffixes_and_group_columns():
    assert category_name_from_filename("futu_groups_7_csv_1. AI基础设施.csv") == "AI基础设施"
    assert normalize_classification_symbol(".IXIC.US") == "IXIC"
    assert normalize_classification_symbol("00700.HK") == "00700"

    content = "代码,名称,分组\nNVDA.US,NVIDIA,AI\nCRCL.US,Circle,金融科技\n".encode()
    groups = parse_classification_file("custom.csv", content, 1)
    assert [(group.suggested_name, group.symbols) for group in groups] == [
        ("AI", frozenset({"NVDA"})),
        ("金融科技", frozenset({"CRCL"})),
    ]


@pytest.mark.asyncio
async def test_classification_preview_and_apply_are_private_and_idempotent():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="category-owner", hashed_password="x", nickname="Owner")
        other = User(username="category-other", hashed_password="x", nickname="Other")
        db.add_all([owner, other])
        await db.flush()
        db.add_all([
            WatchStock(user_id=owner.id, symbol="NXPI", name="NXP", concepts=["Semiconductors"]),
            WatchStock(user_id=owner.id, symbol="CRCL", name="Circle"),
            WatchStock(user_id=other.id, symbol="NXPI", name="Other NXP"),
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
    watchlist_api._classification_sessions.clear()
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            preview = await client.post(
                "/api/v1/watchlist/classification/preview",
                files=[(
                    "files",
                    (
                        "futu_groups_7_csv_1. AI基础设施.csv",
                        "代码,名称,市场\nNXPI.US,恩智浦,美股\nCRCL.US,Circle,美股\nMISS.US,Missing,美股\n".encode(),
                        "text/csv",
                    ),
                )],
            )
            assert preview.status_code == 200
            payload = preview.json()
            assert payload["matched_stock_count"] == 2
            assert payload["unmatched_count"] == 1
            assert payload["groups"][0]["suggested_name"] == "AI基础设施"
            assert payload["groups"][0]["sample_symbols"] == ["CRCL", "NXPI"]

            apply_body = {
                "session_id": payload["session_id"],
                "groups": [{"key": payload["groups"][0]["key"], "label": "AI Infrastructure", "selected": True}],
            }
            current_user["value"] = other
            assert (await client.post("/api/v1/watchlist/classification/apply", json=apply_body)).status_code == 404

            current_user["value"] = owner
            applied = await client.post("/api/v1/watchlist/classification/apply", json=apply_body)
            assert applied.status_code == 200
            assert applied.json()["updated_count"] == 2
            assert applied.json()["assignments_added"] == 2

            stocks = (await client.get("/api/v1/watchlist/stocks")).json()
            nxpi = next(stock for stock in stocks if stock["symbol"] == "NXPI")
            assert nxpi["concepts"] == ["Semiconductors", "AI Infrastructure"]

            repeated = await client.post("/api/v1/watchlist/classification/apply", json=apply_body)
            assert repeated.status_code == 200
            assert repeated.json()["updated_count"] == 0
            assert repeated.json()["unchanged_count"] == 2

            current_user["value"] = other
            other_stocks = (await client.get("/api/v1/watchlist/stocks")).json()
            assert other_stocks[0]["concepts"] == []
    finally:
        watchlist_api._classification_sessions.clear()
        app.dependency_overrides.clear()
        await engine.dispose()
