import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

import app.models  # noqa: F401 - register all mapped tables before create_all
from app.api.v1.ibkr_import import _apply_ibkr_asset_metrics
from app.core.database import Base
from app.core.recalc import recalc_asset
from app.models.asset import Asset, AssetCategory, AssetZone
from app.models.sell_batch_item import SellBatchItem
from app.models.transaction import Transaction, TransactionType
from app.models.user import User


async def _new_session():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    return engine, sessions()


async def _create_asset(db, symbol: str = "TEST") -> tuple[User, Asset]:
    user = User(username=f"user_{symbol.lower()}", hashed_password="test")
    db.add(user)
    await db.flush()
    asset = Asset(
        user_id=user.id,
        symbol=symbol,
        name="Test Asset",
        zone=AssetZone.ACTIVE,
        category=AssetCategory.STOCK,
        market="us",
    )
    db.add(asset)
    await db.flush()
    return user, asset


@pytest.mark.asyncio
async def test_recalc_tracks_partial_sale_profit_in_both_ledger_metrics():
    engine, db = await _new_session()
    try:
        user, asset = await _create_asset(db, "GAIN")
        db.add_all([
            Transaction(asset_id=asset.id, tx_type=TransactionType.BUY, price=100, quantity=10, fee=0),
            Transaction(asset_id=asset.id, tx_type=TransactionType.SELL, price=120, quantity=5, fee=5),
        ])
        await db.flush()

        await recalc_asset(asset.id, user.id, db)
        await db.flush()

        assert float(asset.quantity) == pytest.approx(5)
        assert float(asset.total_cashed) == pytest.approx(95)
        assert float(asset.total_realized_pnl) == pytest.approx(95)
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_recalc_includes_losses_in_net_pnl_but_not_positive_profit_recovery():
    engine, db = await _new_session()
    try:
        user, asset = await _create_asset(db, "LOSS")
        db.add_all([
            Transaction(asset_id=asset.id, tx_type=TransactionType.BUY, price=100, quantity=10, fee=0),
            Transaction(asset_id=asset.id, tx_type=TransactionType.SELL, price=120, quantity=5, fee=5),
            Transaction(asset_id=asset.id, tx_type=TransactionType.SELL, price=80, quantity=5, fee=5),
        ])
        await db.flush()

        await recalc_asset(asset.id, user.id, db)
        await db.flush()

        assert float(asset.total_cashed) == pytest.approx(95)
        assert float(asset.total_realized_pnl) == pytest.approx(-10)
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_recalc_uses_selected_buy_batches_for_realized_pnl():
    engine, db = await _new_session()
    try:
        user, asset = await _create_asset(db, "BATCH")
        first = Transaction(asset_id=asset.id, tx_type=TransactionType.BUY, price=100, quantity=10, fee=0)
        second = Transaction(asset_id=asset.id, tx_type=TransactionType.BUY, price=200, quantity=10, fee=0)
        db.add_all([first, second])
        await db.flush()
        sell = Transaction(asset_id=asset.id, tx_type=TransactionType.SELL, price=150, quantity=5, fee=0)
        db.add(sell)
        await db.flush()
        db.add(SellBatchItem(sell_tx_id=sell.id, buy_tx_id=second.id, quantity=5))
        await db.flush()

        await recalc_asset(asset.id, user.id, db)
        await db.flush()

        assert float(sell.realized_profit) == pytest.approx(-250)
        assert float(asset.total_realized_pnl) == pytest.approx(-250)
        assert float(asset.total_cashed) == pytest.approx(0)
        assert float(asset.quantity) == pytest.approx(15)
        assert float(asset.broker_cost) == pytest.approx(133.3333, abs=0.0001)
    finally:
        await db.close()
        await engine.dispose()


@pytest.mark.asyncio
async def test_ibkr_net_pnl_does_not_overwrite_positive_profit_recovery():
    engine, db = await _new_session()
    try:
        _, asset = await _create_asset(db, "IBKR")
        asset.quantity = 8
        asset.broker_cost = 101
        asset.mental_cost = 99
        asset.total_cashed = 240

        _apply_ibkr_asset_metrics(asset, cost_price=105, realized_pnl=-75)

        assert float(asset.broker_cost) == pytest.approx(105)
        assert float(asset.mental_cost) == pytest.approx(105)
        assert float(asset.total_realized_pnl) == pytest.approx(-75)
        assert float(asset.total_cashed) == pytest.approx(240)
    finally:
        await db.close()
        await engine.dispose()
