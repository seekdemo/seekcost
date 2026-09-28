from datetime import datetime, timezone

import httpx
import pytest
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app.core.quant_cockpit import _classify_stock, _operator_sort_key
from app.core.quant_strategies import (
    PRICE_ANCHOR_STRATEGY_KEY,
    STRATEGY_KEY,
    VOLUME_RATIO_STRATEGY_KEY,
)
from app.core.security import get_current_user
from app.main import app
from app.models.quant_strategy import QuantSignalSnapshot, QuantStrategySetting
from app.models.asset import Asset, AssetCategory, AssetZone
from app.models.user import User
from app.models.watchlist import WatchStage, WatchStock


def _evidence(signal: str, **overrides) -> dict:
    item = {
        "strategy_key": STRATEGY_KEY,
        "signal": signal,
        "level": "normal",
        "unusual_volume": False,
        "reference_gap_pct": None,
    }
    item.update(overrides)
    return item


def test_cockpit_classifies_symbols_for_operator_attention():
    pullback = _evidence("entry_pullback")
    strike = _evidence("anchor_strike_zone", strategy_key=PRICE_ANCHOR_STRATEGY_KEY)
    volume = _evidence(
        "volume_observation",
        strategy_key=VOLUME_RATIO_STRATEGY_KEY,
        unusual_volume=True,
    )
    entry = _classify_stock([pullback, strike, volume])
    assert entry == {
        "disposition": "entry",
        "decision_reason": "pullback_confirmed",
        "next_step": "verify_plan",
        "confirmation_count": 3,
    }

    extended = _classify_stock([
        pullback,
        _evidence(
            "anchor_target_zone",
            strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
            reference_gap_pct=0.03,
        ),
    ])
    assert extended["disposition"] == "extended"
    assert extended["decision_reason"] == "target_or_resistance"
    assert extended["next_step"] == "wait_pullback"

    risk = _classify_stock([
        _evidence("risk_exit", level="risk"),
        _evidence("anchor_target_zone", strategy_key=PRICE_ANCHOR_STRATEGY_KEY),
    ])
    assert risk["disposition"] == "risk"
    assert risk["next_step"] == "review_risk"

    blocked_entry = _classify_stock([
        pullback,
        _evidence("anchor_risk", strategy_key=PRICE_ANCHOR_STRATEGY_KEY, level="risk"),
    ])
    assert blocked_entry["disposition"] == "watch"
    assert blocked_entry["decision_reason"] == "trend_break"


def test_cockpit_keeps_volume_only_and_unconfirmed_trends_in_observation():
    volume_only = _classify_stock([
        _evidence(
            "volume_observation",
            strategy_key=VOLUME_RATIO_STRATEGY_KEY,
            unusual_volume=True,
        ),
    ])
    assert volume_only == {
        "disposition": "watch",
        "decision_reason": "volume_only",
        "next_step": "wait_price_trend",
        "confirmation_count": 1,
    }

    high_baseline = _classify_stock([
        _evidence("market_baseline_deviation", reference_gap_pct=0.08),
    ])
    assert high_baseline["disposition"] == "extended"
    assert high_baseline["decision_reason"] == "baseline_extended"

    weak_baseline = _classify_stock([
        _evidence("market_baseline_deviation", reference_gap_pct=-0.08),
    ])
    assert weak_baseline["disposition"] == "watch"
    assert weak_baseline["decision_reason"] == "trend_repair"

    incomplete = _classify_stock([_evidence("insufficient_data", level="data_issue")])
    assert incomplete["disposition"] == "data_issue"
    assert incomplete["next_step"] == "refresh_data"


def test_operator_sort_prioritizes_confluence_extension_and_risk_severity():
    def row(symbol: str, disposition: str, reason: str, signals: list[dict], confirmations: int = 0):
        return {
            "symbol": symbol,
            "disposition": disposition,
            "decision_reason": reason,
            "confirmation_count": confirmations,
            "changed": False,
            "signals": signals,
        }

    entries = [
        row("STRIKE", "entry", "entry_zone", [_evidence("anchor_strike_zone")], 1),
        row("PULL", "entry", "pullback_confirmed", [_evidence("entry_pullback")], 2),
    ]
    assert [item["symbol"] for item in sorted(entries, key=_operator_sort_key)] == ["PULL", "STRIKE"]

    extended = [
        row("NEAR", "extended", "target_or_resistance", [_evidence("anchor_target_zone", reference_gap_pct=0.01)]),
        row("HOT", "extended", "baseline_extended", [_evidence("market_baseline_deviation", reference_gap_pct=0.25)]),
    ]
    assert [item["symbol"] for item in sorted(extended, key=_operator_sort_key)] == ["HOT", "NEAR"]

    risks = [
        row("BUFFER", "risk", "position_risk", [_evidence("risk_exit", reason_codes=["ma5_buffer_break"])]),
        row("HARD", "risk", "position_risk", [_evidence("risk_exit", reason_codes=["hard_stop"])]),
    ]
    assert [item["symbol"] for item in sorted(risks, key=_operator_sort_key)] == ["HARD", "BUFFER"]


def _snapshot(
    user_id: int,
    stock_id: int,
    strategy_key: str,
    signal: str,
    *,
    bar_date: str = "2026-08-22",
    metrics: dict | None = None,
    evaluated_at: datetime | None = None,
) -> QuantSignalSnapshot:
    return QuantSignalSnapshot(
        user_id=user_id,
        stock_id=stock_id,
        strategy_key=strategy_key,
        strategy_version="1.0.0",
        signal=signal,
        reason_codes=[f"reason_{signal}"],
        metrics=metrics or {},
        bar_date=bar_date,
        source="test",
        execution_timing=None,
        error_code=None,
        evaluated_at=evaluated_at or datetime.now(timezone.utc),
    )


@pytest.mark.asyncio
async def test_workbench_combines_latest_private_quant_strategy_snapshots():
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    async with sessions() as db:
        owner = User(username="workbench-owner", hashed_password="x")
        other = User(username="workbench-other", hashed_password="x")
        db.add_all([owner, other])
        await db.flush()
        first = WatchStock(
            user_id=owner.id,
            symbol="OWN1",
            name="Owner one",
            stage=WatchStage.RADAR,
            thesis="thesis",
            invalidation="invalidation",
        )
        second = WatchStock(
            user_id=owner.id,
            symbol="OWN2",
            name="Owner two",
            stage=WatchStage.RADAR,
            thesis="thesis",
            invalidation="invalidation",
        )
        foreign = WatchStock(
            user_id=other.id,
            symbol="OTHER",
            name="Other user",
            stage=WatchStage.RADAR,
        )
        db.add_all([first, second, foreign])
        await db.flush()
        db.add(Asset(
            user_id=owner.id,
            symbol="OWN2.US",
            name="Owner position",
            zone=AssetZone.ACTIVE,
            category=AssetCategory.STOCK,
            market="us",
            quantity=4,
            broker_cost=90,
        ))
        db.add_all([
            QuantStrategySetting(
                user_id=owner.id,
                strategy_key=PRICE_ANCHOR_STRATEGY_KEY,
                enabled=True,
            ),
            QuantStrategySetting(
                user_id=owner.id,
                strategy_key=STRATEGY_KEY,
                enabled=True,
            ),
            QuantStrategySetting(
                user_id=owner.id,
                strategy_key=VOLUME_RATIO_STRATEGY_KEY,
                enabled=True,
            ),
            _snapshot(
                owner.id,
                first.id,
                STRATEGY_KEY,
                "watch",
                bar_date="2026-08-20",
                evaluated_at=datetime(2026, 8, 21, tzinfo=timezone.utc),
            ),
            _snapshot(
                owner.id,
                first.id,
                STRATEGY_KEY,
                "entry_breakout",
                bar_date="2026-08-22",
                metrics={"close": 101, "ma5": 99},
                evaluated_at=datetime(2026, 8, 22, 20, tzinfo=timezone.utc),
            ),
            # Same-session rescan must replace the current evidence, not become
            # the previous comparison row.
            _snapshot(
                owner.id,
                first.id,
                STRATEGY_KEY,
                "entry_pullback",
                bar_date="2026-08-22",
                metrics={"close": 100, "ma5": 99},
                evaluated_at=datetime(2026, 8, 22, 21, tzinfo=timezone.utc),
            ),
            _snapshot(
                owner.id,
                first.id,
                PRICE_ANCHOR_STRATEGY_KEY,
                "anchor_risk",
                metrics={
                    "close": 100,
                    "reference_code": "ma5_risk_line",
                    "reference_price": 102,
                    "reference_gap_pct": -0.019608,
                },
            ),
            _snapshot(
                owner.id,
                second.id,
                PRICE_ANCHOR_STRATEGY_KEY,
                "anchor_target_zone",
                metrics={
                    "close": 120,
                    "reference_code": "saved_target",
                    "reference_price": 118,
                    "reference_gap_pct": 0.016949,
                },
            ),
            _snapshot(
                owner.id,
                second.id,
                STRATEGY_KEY,
                "provider_error",
            ),
            _snapshot(
                owner.id,
                second.id,
                VOLUME_RATIO_STRATEGY_KEY,
                "volume_observation",
                metrics={"close": 120, "volume_ratio_3d": 1.45},
            ),
            _snapshot(other.id, foreign.id, PRICE_ANCHOR_STRATEGY_KEY, "anchor_strike_zone"),
        ])
        await db.commit()

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
            response = await client.get("/api/v1/workbench/overview")
        assert response.status_code == 200
        monitoring = response.json()["quant_monitoring"]
        assert monitoring["enabled"] is True
        assert monitoring["watchlist_count"] == 2
        assert monitoring["scanned_count"] == 2
        assert monitoring["matches_count"] == 2
        assert monitoring["attention_count"] == 2
        assert {
            (item["strategy_key"], item["stock_id"], item["signal"])
            for item in monitoring["signals"]
        } == {
            (STRATEGY_KEY, first.id, "entry_pullback"),
            (PRICE_ANCHOR_STRATEGY_KEY, first.id, "anchor_risk"),
            (PRICE_ANCHOR_STRATEGY_KEY, second.id, "anchor_target_zone"),
            (STRATEGY_KEY, second.id, "provider_error"),
        }

        cockpit = response.json()["quant_cockpit"]
        assert cockpit["enabled_strategy_count"] == 3
        assert cockpit["watchlist_count"] == 2
        assert cockpit["summary"] == {
            "entry_count": 0,
            "watch_count": 1,
            "extended_count": 1,
            "risk_count": 0,
            "trigger_count": 2,
            "change_count": 1,
            "data_issue_count": 1,
            "data_incomplete_count": 0,
            "unscanned_count": 0,
        }
        assert len(cockpit["stocks"]) == 2
        first_row = next(item for item in cockpit["stocks"] if item["stock_id"] == first.id)
        assert first_row["level"] == "risk"
        assert first_row["has_position"] is False
        assert first_row["disposition"] == "watch"
        assert first_row["decision_reason"] == "trend_break"
        assert first_row["headline"]["signal"] == "anchor_risk"
        five_day = next(
            item for item in first_row["signals"] if item["strategy_key"] == STRATEGY_KEY
        )
        assert five_day["signal"] == "entry_pullback"
        assert five_day["previous_signal"] == "watch"
        assert five_day["changed"] is True

        second_row = next(item for item in cockpit["stocks"] if item["stock_id"] == second.id)
        assert second_row["level"] == "trigger"
        assert second_row["has_position"] is True
        assert second_row["disposition"] == "extended"
        assert second_row["decision_reason"] == "target_or_resistance"
        volume = next(
            item
            for item in second_row["signals"]
            if item["strategy_key"] == VOLUME_RATIO_STRATEGY_KEY
        )
        assert volume["unusual_volume"] is True
        assert volume["volume_ratio_3d"] == 1.45
        assert volume["level"] == "normal"
        assert cockpit["strategies"][0]["strategy_key"] in {
            STRATEGY_KEY,
            PRICE_ANCHOR_STRATEGY_KEY,
            VOLUME_RATIO_STRATEGY_KEY,
        }
        assert all(item["symbol"] != "OTHER" for item in cockpit["stocks"])
    finally:
        app.dependency_overrides.clear()
        await engine.dispose()
