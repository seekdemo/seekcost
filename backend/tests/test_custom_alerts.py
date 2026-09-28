from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import httpx
import pytest
import pytest_asyncio
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
from app.main import app
from app.core.database import Base, get_db
from app.core.security import get_current_user
from app.core.custom_alerts import evaluate, should_notify, apply_observation
from app.models.user import User
from app.models.watchlist import WatchStock
from app.models.custom_alert import AlertRule, AlertNotification, AlertRuleState

NOW = datetime(2026, 9, 15, 14, tzinfo=timezone.utc)


def market(price=101, now=NOW):
    bars = []
    for day in (10, 11, 14, 15):
        timestamp = int(datetime(2026, 9, day, 14, tzinfo=timezone.utc).timestamp())
        close = 500 if day == 15 else 100
        bars.append(dict(date=timestamp, open=close, high=close, low=close, close=close, volume=100))
    return {"items": bars, "exchange_timezone": "America/New_York"}, {
        "status": "available", "as_of": now.timestamp(), "price": price, "currency": "USD",
        "session_start": now.timestamp() - 3600, "session_end": now.timestamp() + 14400}


def rule(**kwargs):
    return SimpleNamespace(period=3, tolerance=2, side=kwargs.get("side", "both"), inside=kwargs.get("inside"),
                           last_triggered_at=kwargs.get("last_triggered_at"), cooldown_minutes=60)


@pytest.mark.parametrize("price,side,inside", [(102, "both", True), (98, "both", True), (102.01, "both", False),
                                               (99, "above", False), (101, "below", False), (100, "below", True)])
def test_band_and_completed_sma(price, side, inside):
    status, evidence, actual = evaluate(rule(side=side), *market(price), NOW)
    assert evidence["sma"] == 100  # Today's unfinished close of 500 is excluded.
    assert actual is inside


def test_data_failures_do_not_become_entries():
    history, quote = market()
    quote["as_of"] -= 1201
    assert evaluate(rule(), history, quote, NOW) == ("stale", None, None)
    history, quote = market()
    history["items"] = history["items"][-2:]
    assert evaluate(rule(), history, quote, NOW)[0] == "insufficient_data"
    assert evaluate(rule(), history, {"status": "unavailable"}, NOW)[0] == "provider_error"
    history, quote = market(float("nan"))
    assert evaluate(rule(), history, quote, NOW)[0] == "invalid_data"
    history, quote = market()
    quote["session_end"] = NOW.timestamp()
    assert evaluate(rule(), history, quote, NOW)[0] == "market_closed"


def test_entry_and_cooldown():
    assert should_notify(rule(), True, NOW)
    assert not should_notify(rule(inside=True), True, NOW)
    assert not should_notify(rule(last_triggered_at=NOW - timedelta(minutes=59)), True, NOW)
    assert should_notify(rule(last_triggered_at=NOW - timedelta(minutes=60)), True, NOW)
    assert not should_notify(rule(), None, NOW)


@pytest_asyncio.fixture
async def store(tmp_path):
    # Concurrent scanners need independent connections/transactions, not one
    # StaticPool connection shared by overlapping async sessions.
    engine = create_async_engine(f"sqlite+aiosqlite:///{tmp_path / 'alerts.sqlite'}")
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    async with sessions() as db:
        owner = User(username="alerts-owner", hashed_password="x")
        other = User(username="alerts-other", hashed_password="x")
        db.add_all([owner, other]); await db.flush()
        stock = WatchStock(user_id=owner.id, symbol="TEST", name="Test")
        foreign = WatchStock(user_id=other.id, symbol="FOREIGN", name="Other")
        db.add_all([stock, foreign]); await db.commit()
    yield sessions, owner, other, stock, foreign
    await engine.dispose()


@pytest.mark.asyncio
async def test_persistent_entry_state_cas_and_notification_snapshot(store):
    sessions, owner, _, stock, _ = store
    async with sessions() as db:
        r = AlertRule(user_id=owner.id, stock_id=stock.id, name="Test alert", period=3, tolerance=2, side="both", cooldown_minutes=60)
        db.add(r); await db.commit(); rule_id = r.id
        assert await apply_observation(db, r, stock.symbol, *market(), NOW)
        # The same old rule version cannot insert twice.
        assert not await apply_observation(db, r, stock.symbol, *market(), NOW)
    for minute, price, expected in [(5, 101, False), (10, 105, False), (15, 101, False),
                                    (61, 101, False), (62, 105, False), (63, 101, True)]:
        now = NOW + timedelta(minutes=minute)
        async with sessions() as db:
            r = await db.get(AlertRule, rule_id)
            assert await apply_observation(db, r, stock.symbol, *market(price, now), now) is expected
    async with sessions() as db:
        r = await db.get(AlertRule, rule_id)
        assert r.inside is True
        await apply_observation(db, r, stock.symbol, {}, {"status": "unavailable"}, NOW + timedelta(minutes=65))
    async with sessions() as db:
        r = await db.get(AlertRule, rule_id)
        assert r.inside is True and r.status == "provider_error"
        assert await db.scalar(select(func.count()).select_from(AlertNotification)) == 2
        note = await db.scalar(select(AlertNotification).order_by(AlertNotification.id))
        assert note.evidence["sma"] == 100 and note.evidence["price"] == 101


@pytest.mark.asyncio
async def test_owned_crud_notifications_and_validation(store):
    sessions, owner, other, stock, foreign = store
    current = owner
    async def db_override():
        async with sessions() as db:
            yield db
    async def user_override():
        return current
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    body = dict(stock_id=stock.id, name="Test rule", period=3, tolerance=2, side="both", cooldown_minutes=60, enabled=True)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.post("/api/v1/alerts/rules", json={**body, "stock_id": foreign.id})).status_code == 404
            assert (await client.post("/api/v1/alerts/rules", json={**body, "period": 0})).status_code == 422
            created = await client.post("/api/v1/alerts/rules", json=body)
            assert created.status_code == 201
            rule_id = created.json()["id"]
            async with sessions() as db:
                r = await db.get(AlertRule, rule_id)
                await apply_observation(db, r, stock.symbol, *market(), NOW)
            inbox = (await client.get("/api/v1/alerts/notifications")).json()
            assert inbox["unread_count"] == 1
            note_id = inbox["items"][0]["id"]
            current = other
            assert (await client.get("/api/v1/alerts/rules")).json() == []
            assert (await client.get("/api/v1/alerts/notifications")).json()["unread_count"] == 0
            assert (await client.put(f"/api/v1/alerts/rules/{rule_id}", json=body)).status_code == 404
            assert (await client.delete(f"/api/v1/alerts/rules/{rule_id}")).status_code == 404
            assert (await client.post(f"/api/v1/alerts/notifications/{note_id}/read")).status_code == 404
            current = owner
            assert (await client.put(f"/api/v1/alerts/rules/{rule_id}", json={**body, "enabled": False})).json()["enabled"] is False
            assert (await client.post(f"/api/v1/alerts/notifications/{note_id}/read")).status_code == 200
            assert (await client.post(f"/api/v1/alerts/notifications/{note_id}/read")).status_code == 200
            assert (await client.get("/api/v1/alerts/notifications?unread=true")).json()["items"] == []
            assert (await client.delete(f"/api/v1/alerts/rules/{rule_id}")).status_code == 204
            assert len((await client.get("/api/v1/alerts/notifications")).json()["items"]) == 1
    finally:
        app.dependency_overrides.clear()


@pytest.mark.asyncio
async def test_background_scan_runs_without_browser_and_skips_disabled(store, monkeypatch):
    import app.core.custom_alerts as detector
    sessions, owner, _, stock, _ = store
    now = datetime.now(timezone.utc)
    history, quote = market(now=now)
    calls = []
    def daily(*args):
        calls.append(args)
        return history
    async def quote_fetch(*args):
        return quote
    monkeypatch.setattr(detector, "fetch_daily_bars", daily)
    monkeypatch.setattr(detector, "get_market_quote", quote_fetch)
    # Use a fixed evaluator time so this integration test is deterministic on weekends too.
    original = detector.evaluate
    monkeypatch.setattr(detector, "evaluate", lambda r, h, q, n: original(r, h, {**q, **market()[1]}, NOW))
    async with sessions() as db:
        db.add_all([AlertRule(user_id=owner.id, stock_id=stock.id, name=f"Rule {i}", period=3,
                             tolerance=2, side="both", cooldown_minutes=60, enabled=i != 2) for i in range(3)])
        await db.commit()
    await detector.scan_once(sessions)
    await detector.scan_once(sessions)
    assert len(calls) == 2  # Once per symbol per cycle, not once per rule.
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(AlertNotification)) == 2


def test_migration_can_upgrade_and_downgrade_isolated_database():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    path = Path(__file__).parents[1] / "alembic/versions/e5a9b1c4d7f0_custom_alerts.py"
    spec = importlib.util.spec_from_file_location("alert_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE watch_stocks (id INTEGER PRIMARY KEY)")
        migration.op = Operations(MigrationContext.configure(conn))
        migration.upgrade()
        assert "custom_alert_rules" in inspect(conn).get_table_names()
        assert inspect(conn).get_indexes("alert_notifications")[0]["name"] == "ix_alert_notifications_inbox"
        migration.downgrade()
        assert "alert_notifications" not in inspect(conn).get_table_names()
    engine.dispose()


@pytest.mark.asyncio
async def test_watchlist_scan_independent_entries_additions_and_pause(store, monkeypatch):
    import app.core.custom_alerts as detector
    sessions, owner, _, stock, _ = store
    calls = []
    prices = {"TEST": 101, "SECOND": 105, "NEW": 101}
    def daily(symbol, *args):
        calls.append(symbol)
        return market()[0]
    async def quote_fetch(symbol, *args):
        return market(prices[symbol])[1]
    original = detector.evaluate
    monkeypatch.setattr(detector, "fetch_daily_bars", daily)
    monkeypatch.setattr(detector, "get_market_quote", quote_fetch)
    monkeypatch.setattr(detector, "evaluate", lambda r, h, q, n: original(r, h, q, NOW))
    async with sessions() as db:
        db.add(WatchStock(user_id=owner.id, symbol="SECOND", name="Second"))
        r = AlertRule(user_id=owner.id, scope="watchlist", name="All stocks", period=3,
                      tolerance=2, side="both", cooldown_minutes=60)
        db.add(r); await db.commit(); rule_id = r.id
    await detector.scan_once(sessions)
    prices["SECOND"] = 101  # First stock's cooldown must not suppress this entry.
    await detector.scan_once(sessions)
    await detector.scan_once(sessions)
    async with sessions() as db:
        notes = list((await db.scalars(select(AlertNotification))).all())
        assert sorted(n.symbol for n in notes) == ["SECOND", "TEST"]
        assert all(n.user_id == owner.id for n in notes)
        db.add(WatchStock(user_id=owner.id, symbol="NEW", name="New addition"))
        await db.commit()
    await detector.scan_once(sessions)
    assert "FOREIGN" not in calls
    async with sessions() as db:
        assert await db.scalar(select(func.count()).select_from(AlertNotification)) == 3
        assert await db.scalar(select(func.count()).select_from(AlertRuleState)) == 3
        r = await db.get(AlertRule, rule_id)
        r.enabled = False; r.version += 1
        await db.commit()
    count = len(calls)
    await detector.scan_once(sessions)
    assert len(calls) == count


@pytest.mark.asyncio
async def test_watchlist_api_scope_stats_and_delete_preserve_notifications(store):
    sessions, owner, _, stock, _ = store
    async def db_override():
        async with sessions() as db:
            yield db
    async def user_override():
        return owner
    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[get_current_user] = user_override
    body = dict(scope="watchlist", stock_id=None, name="All", period=3, tolerance=2,
                side="both", cooldown_minutes=60, enabled=True)
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
            assert (await client.post("/api/v1/alerts/rules", json={**body, "scope": "single"})).status_code == 422
            created = await client.post("/api/v1/alerts/rules", json=body)
            assert created.status_code == 201
            result = created.json(); rid = result["id"]
            assert result["stock_id"] is None and result["target_count"] == 1
            async with sessions() as db:
                r = await db.get(AlertRule, rid)
                state = AlertRuleState(rule_id=rid, stock_id=stock.id)
                db.add(state); await db.commit()
                assert await apply_observation(db, r, stock.symbol, *market(), NOW, state)
            result = (await client.get("/api/v1/alerts/rules")).json()[0]
            assert result["checked_count"] == result["inside_count"] == 1
            assert result["unavailable_count"] == 0
            # Changing to a single target retains that stock's cooldown.
            result = (await client.put(f"/api/v1/alerts/rules/{rid}", json={**body, "scope": "single", "stock_id": stock.id})).json()
            assert result["last_triggered_at"] is not None
            result = (await client.put(f"/api/v1/alerts/rules/{rid}", json=body)).json()
            assert result["checked_count"] == 0
            async with sessions() as db:
                state = await db.scalar(select(AlertRuleState).where(AlertRuleState.rule_id == rid))
                assert state.inside is None and state.last_triggered_at is not None
            # Removing a stock must retain the global rule and historical notice.
            assert (await client.delete(f"/api/v1/watchlist/stocks/{stock.id}")).status_code == 204
            result = (await client.get("/api/v1/alerts/rules")).json()[0]
            assert result["target_count"] == 0
            assert (await client.post("/api/v1/alerts/rules", json=body)).status_code == 201
            assert (await client.delete(f"/api/v1/alerts/rules/{rid}")).status_code == 204
            async with sessions() as db:
                assert await db.scalar(select(func.count()).select_from(AlertRuleState)) == 0
                note = await db.scalar(select(AlertNotification))
                assert note.rule_id is None and note.symbol == stock.symbol
    finally:
        app.dependency_overrides.clear()


def test_local_scope_upgrade_preserves_existing_rules_and_is_idempotent():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.core.alert_scope_schema import ensure_alert_scope_schema
    path = Path(__file__).parents[1] / "alembic/versions/e5a9b1c4d7f0_custom_alerts.py"
    spec = importlib.util.spec_from_file_location("old_alert_schema", path)
    migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE watch_stocks (id INTEGER PRIMARY KEY)")
        migration.op = Operations(MigrationContext.configure(conn)); migration.upgrade()
        conn.exec_driver_sql("INSERT INTO custom_alert_rules (id,user_id,stock_id,name,period,tolerance,side,cooldown_minutes,enabled,version,status,created_at) VALUES (1,1,7,'Existing',20,2,'both',60,1,4,'inside',CURRENT_TIMESTAMP)")
        conn.exec_driver_sql("INSERT INTO alert_notifications (id,user_id,rule_id,stock_id,rule_name,symbol,evidence) VALUES (1,1,1,7,'Existing','TEST','{}')")
        ensure_alert_scope_schema(conn); ensure_alert_scope_schema(conn)
        assert conn.exec_driver_sql("SELECT stock_id,scope,version,name FROM custom_alert_rules").one() == (7, "single", 4, "Existing")
        assert conn.exec_driver_sql("SELECT rule_id,stock_id FROM alert_notifications").one() == (1, 7)
        assert next(c for c in inspect(conn).get_columns("custom_alert_rules") if c["name"] == "stock_id")["nullable"]
    engine.dispose()


@pytest.mark.asyncio
async def test_global_claim_rejects_stale_parent_and_target_versions(store):
    from sqlalchemy import update
    sessions, owner, _, stock, _ = store
    async with sessions() as db:
        r = AlertRule(user_id=owner.id, scope="watchlist", name="Global", period=3,
                      tolerance=2, side="both", cooldown_minutes=60)
        db.add(r); await db.flush()
        state = AlertRuleState(rule_id=r.id, stock_id=stock.id)
        db.add(state); await db.commit(); rid, sid = r.id, state.id
        assert await apply_observation(db, r, stock.symbol, *market(), NOW, state)
        assert not await apply_observation(db, r, stock.symbol, *market(), NOW, state)
    async with sessions() as db:
        r, state = await db.get(AlertRule, rid), await db.get(AlertRuleState, sid)
        await db.execute(update(AlertRule).where(AlertRule.id == rid).values(enabled=False, version=r.version + 1).execution_options(synchronize_session=False))
        await db.commit()
        assert not await apply_observation(db, r, stock.symbol, *market(105), NOW, state)
    async with sessions() as db:
        state = await db.get(AlertRuleState, sid)
        assert state.inside is True  # Paused while a scan was in flight.
        assert await db.scalar(select(func.count()).select_from(AlertNotification)) == 1


def test_alembic_scope_migration_preserves_history_and_refuses_lossy_downgrade():
    import importlib.util
    from pathlib import Path
    from sqlalchemy import create_engine, inspect
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    engine = create_engine("sqlite:///:memory:")
    with engine.begin() as conn:
        conn.exec_driver_sql("CREATE TABLE users (id INTEGER PRIMARY KEY)")
        conn.exec_driver_sql("CREATE TABLE watch_stocks (id INTEGER PRIMARY KEY)")
        for filename in ("e5a9b1c4d7f0_custom_alerts.py", "f6b0c2d5e8a1_all_watchlist_alerts.py"):
            path = Path(__file__).parents[1] / "alembic/versions" / filename
            spec = importlib.util.spec_from_file_location(filename, path)
            migration = importlib.util.module_from_spec(spec); spec.loader.exec_module(migration)
            migration.op = Operations(MigrationContext.configure(conn)); migration.upgrade()
            if filename.startswith("e5"):
                conn.exec_driver_sql("INSERT INTO custom_alert_rules (id,user_id,stock_id,name,period,tolerance,side,cooldown_minutes,enabled,version,status) VALUES (1,1,7,'Old',20,2,'both',60,1,3,'inside')")
                conn.exec_driver_sql("INSERT INTO alert_notifications (id,user_id,rule_id,stock_id,rule_name,symbol,evidence) VALUES (1,1,1,7,'Old','TEST','{}')")
        assert conn.exec_driver_sql("SELECT scope,version FROM custom_alert_rules").one() == ("single", 3)
        assert conn.exec_driver_sql("SELECT rule_id,stock_id FROM alert_notifications").one() == (1, 7)
        assert "custom_alert_rule_states" in inspect(conn).get_table_names()
        conn.exec_driver_sql("UPDATE custom_alert_rules SET scope='watchlist',stock_id=NULL")
        with pytest.raises(RuntimeError, match="refusing data loss"):
            migration.downgrade()
        conn.exec_driver_sql("UPDATE custom_alert_rules SET scope='single',stock_id=7")
        migration.downgrade()
        assert conn.exec_driver_sql("SELECT stock_id,version FROM custom_alert_rules").one() == (7, 3)
    engine.dispose()
