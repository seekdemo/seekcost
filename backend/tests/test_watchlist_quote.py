import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.main import app
from app.models.user import User
from app.models.watchlist import WatchStock
import app.api.v1.watchlist as watchlist_api


@pytest.mark.asyncio
async def test_watchlist_quote_refreshes_one_user_stock(monkeypatch):
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with sessions() as db:
        owner = User(username="quote-owner", hashed_password="x")
        other = User(username="quote-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        own_stock = WatchStock(user_id=owner.id, symbol="AVGO", name="Broadcom", current_price=427.76, price_change=7.2, price_change_pct=1.7)
        foreign_stock = WatchStock(user_id=other.id, symbol="AVGO", name="Other Broadcom", current_price=427.76)
        db.add_all([own_stock, foreign_stock])
        await db.commit()
        own_id = own_stock.id

    monkeypatch.setattr(watchlist_api, "fetch_prices", lambda symbols, markets: {symbols[0]: (358.76, "closed")})

    async def override_db():
        async with sessions() as db:
            yield db

    async def override_user():
        return owner

    app.dependency_overrides[get_db] = override_db
    app.dependency_overrides[get_current_user] = override_user
    try:
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get(f"/api/v1/watchlist/stocks/{own_id}/quote")
        assert response.status_code == 200
        assert response.json()["price"] == 358.76
        async with sessions() as db:
            saved = await db.scalar(select(WatchStock).where(WatchStock.id == own_id))
            assert float(saved.current_price) == 358.76
            assert saved.price_session == "closed"
            assert saved.price_change is None
            assert saved.price_change_pct is None
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
