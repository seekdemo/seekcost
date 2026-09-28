# Five-Day-Line Quant Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the five-day-line observation strategy as the first private, auditable quant plugin that users can enable, scan on completed daily bars, and inspect from the decision system and stock dossier.

**Architecture:** Keep strategy math in a pure provider-independent engine. Persist user settings, tri-state three-low qualifications, and append-only signal snapshots; expose one-stock scan endpoints so the client can scan a large watchlist with bounded concurrency and visible progress instead of holding one long server request. Put plugin management at `/quant` under the Decision area, while stock dossiers show only the latest snapshot and explicit scan controls.

**Tech Stack:** FastAPI, SQLAlchemy 2 async, Alembic, Pydantic v2, pytest/httpx, Next.js 16, React 19, TypeScript, Tailwind CSS, Playwright.

## Global Constraints

- Strategy key is `chang-five-day-line`; initial formula version is `1.0.0`.
- Default parameters are volume multiplier `1.45`, MA5 break buffer `0.075`, hard stop `0.20`, recovery window `3` completed sessions, pullback maximum positive MA5 bias `0.02`, and prior-trend lookback `5` sessions.
- All signals use completed daily closing bars only; a same-session partial Yahoo bar must never trigger a signal.
- A signal generated from session T is labeled for review at the next session open; the system must not claim a same-day fill.
- Three-low qualification is tri-state and manually confirmed until reliable valuation-history and attention data sources exist. Missing or failed qualification blocks entry signals but never blocks risk checks on an existing holding.
- High-bias partial profit-taking remains informational because the supplied strategy has no numeric threshold; do not invent an automatic trigger.
- Results are evidence, not investment advice. Every response includes formula version, source, bar date, metrics, and reason codes.
- All settings, qualifications, snapshots, assets, and watchlist stocks are scoped to `current_user.id`.
- Newly created watchlist stocks appear automatically without per-strategy seeding.
- External tool navigation at `/tools` remains independent and unchanged.
- English remains the default UI locale; Simplified Chinese receives complete feature copy and other locales fall back to English.

---

### Task 1: Deterministic Strategy Engine

**Files:**
- Create: `backend/app/core/quant_strategies/__init__.py`
- Create: `backend/app/core/quant_strategies/chang_five_day.py`
- Create: `backend/app/core/market_history.py`
- Modify: `backend/app/api/v1/prices.py`
- Test: `backend/tests/test_chang_five_day_strategy.py`

**Interfaces:**
- Consumes: `DailyBarInput` from `app.schemas.prices` and an optional positive position cost.
- Produces: `evaluate_chang_five_day(bars, qualification, position, parameters) -> ChangFiveDayResult`, `completed_daily_bars(...)`, `infer_watch_market(symbol, sector)`, and `fetch_daily_bars(...)`.

- [ ] **Step 1: Write failing engine tests for exact entry and risk precedence**

```python
def test_breakout_requires_three_consecutive_145x_volume_sessions():
    result = evaluate_chang_five_day(
        breakout_bars(),
        ThreeLowQualification(True, True, True),
        PositionContext(),
        DEFAULT_PARAMETERS,
    )
    assert result.signal == "entry_breakout"
    assert result.reason_codes == ["breakout_volume"]
    assert result.execution_timing == "next_session_open"

def test_risk_exit_precedes_missing_three_low_qualification_for_a_holding():
    result = evaluate_chang_five_day(
        buffer_break_bars(),
        ThreeLowQualification(None, None, None),
        PositionContext(has_position=True, cost_basis=120),
        DEFAULT_PARAMETERS,
    )
    assert result.signal == "risk_exit"
    assert "ma5_buffer_break" in result.reason_codes
```

- [ ] **Step 2: Run engine tests and verify they fail because the package does not exist**

Run: `cd backend && pytest tests/test_chang_five_day_strategy.py -q`

Expected: FAIL during collection with `ModuleNotFoundError: app.core.quant_strategies`.

- [ ] **Step 3: Implement typed inputs, metrics, and signal precedence**

```python
STRATEGY_KEY = "chang-five-day-line"
STRATEGY_VERSION = "1.0.0"
DEFAULT_PARAMETERS = ChangFiveDayParameters(
    volume_multiplier=1.45,
    break_buffer_pct=0.075,
    hard_stop_pct=0.20,
    recovery_sessions=3,
    pullback_max_bias_pct=0.02,
    trend_lookback=5,
)

def evaluate_chang_five_day(
    bars: list[DailyBarInput],
    qualification: ThreeLowQualification,
    position: PositionContext,
    parameters: ChangFiveDayParameters = DEFAULT_PARAMETERS,
) -> ChangFiveDayResult:
    """Evaluate oldest-to-newest completed bars with risk rules before entry gates."""
```

The implementation computes inclusive rolling MA5 and volume MA5, requires all of the latest three volume ratios to be at least `1.45`, recognizes pullback only when current close is in `[MA5, MA5 * 1.02]`, current volume is below its inclusive volume MA5, current MA5 is rising, at least four of the five preceding closes are at or above their aligned MA5, and the preceding three MA5 steps rise. Three-day failure uses `all(close <= ma5 for the latest three sessions)`, not a rolling count over a wider window.

- [ ] **Step 4: Extract the Yahoo history provider without changing the existing price contract**

Move `_fetch_daily_bars` to `fetch_daily_bars` in `market_history.py`; import it back into `prices.py` as `_fetch_daily_bars` so existing monkeypatch-based tests and API behavior remain stable. Add `completed_daily_bars` that removes a same-local-date bar before 16:15 in the exchange timezone and retains it after that cutoff.

- [ ] **Step 5: Run engine and existing price-volume tests**

Run: `cd backend && pytest tests/test_chang_five_day_strategy.py tests/test_price_volume.py -q`

Expected: PASS, including partial-session exclusion and the existing `/prices/price-volume` contract.

- [ ] **Step 6: Commit the pure engine**

```bash
git add backend/app/core/quant_strategies backend/app/core/market_history.py backend/app/api/v1/prices.py backend/tests/test_chang_five_day_strategy.py
git commit -m "feat: add auditable five-day-line strategy engine"
```

---

### Task 2: Private Plugin Persistence and APIs

**Files:**
- Create: `backend/app/models/quant_strategy.py`
- Create: `backend/app/schemas/quant_strategy.py`
- Create: `backend/app/api/v1/quant_strategies.py`
- Create: `backend/alembic/versions/e4f5a6b7c8d9_add_quant_strategy_plugins.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/alembic/env.py`
- Modify: `backend/app/core/demo_cleanup.py`
- Test: `backend/tests/test_quant_strategies.py`

**Interfaces:**
- Consumes: Task 1 `evaluate_chang_five_day`, `fetch_daily_bars`, `completed_daily_bars`, and `infer_watch_market`.
- Produces: `GET /api/v1/quant-strategies`, `PATCH /api/v1/quant-strategies/{strategy_key}`, `GET /api/v1/quant-strategies/{strategy_key}/stocks`, `PUT /api/v1/quant-strategies/{strategy_key}/stocks/{stock_id}/qualification`, and `POST /api/v1/quant-strategies/{strategy_key}/stocks/{stock_id}/scan`.

- [ ] **Step 1: Write failing owner-scope and scan lifecycle tests**

```python
enabled = await client.patch(
    "/api/v1/quant-strategies/chang-five-day-line",
    json={"enabled": True},
)
assert enabled.json()["enabled"] is True

qualified = await client.put(
    f"/api/v1/quant-strategies/chang-five-day-line/stocks/{stock.id}/qualification",
    json={"historical_low": True, "valuation_low": True, "attention_low": True},
)
assert qualified.json()["qualified"] is True

scanned = await client.post(
    f"/api/v1/quant-strategies/chang-five-day-line/stocks/{stock.id}/scan"
)
assert scanned.json()["strategy_version"] == "1.0.0"
assert scanned.json()["source"] == "yahoo_finance"
assert scanned.json()["reason_codes"]
```

Tests also switch `get_current_user` to another user and assert no settings, qualifications, snapshots, watchlist stocks, or position costs leak across users. Scanning while disabled returns `409`; missing qualification without a holding returns `needs_qualification` without calling Yahoo; a holding still fetches and evaluates risk.

- [ ] **Step 2: Run API tests and verify missing routes fail**

Run: `cd backend && pytest tests/test_quant_strategies.py -q`

Expected: FAIL with `404 Not Found` for `/api/v1/quant-strategies`.

- [ ] **Step 3: Add three normalized private tables**

```python
class QuantStrategySetting(Base):
    __tablename__ = "quant_strategy_settings"
    __table_args__ = (UniqueConstraint("user_id", "strategy_key"),)

class QuantStrategyQualification(Base):
    __tablename__ = "quant_strategy_qualifications"
    __table_args__ = (UniqueConstraint("user_id", "strategy_key", "stock_id"),)

class QuantSignalSnapshot(Base):
    __tablename__ = "quant_signal_snapshots"
```

`QuantSignalSnapshot` is append-only and stores signal, reason codes JSON, metrics JSON, strategy version, bar date, source, evaluated timestamp, and optional error code. Add composite indexes for latest-by-user/strategy/stock queries and cascade stock deletion. Migration `e4f5a6b7c8d9` follows the last committed revision `c2d3e4f5a6b7`; the independent, uncommitted tools migration is rebased to follow it without entering the quant commit.

- [ ] **Step 4: Implement the built-in registry and API responses**

`GET /quant-strategies` returns the built-in plugin even when no setting row exists, defaulting `enabled=false`. The stocks endpoint starts from the current watchlist and left-merges qualification plus the latest snapshot, so new stocks appear automatically. It returns no historical duplicate rows.

- [ ] **Step 5: Implement one-stock scanning with completed bars and owned position cost**

The scan route validates enabled state and stock ownership, finds an active stock/ETF asset for the same current user and normalized symbol, fetches `2y` history only when data is needed, removes partial bars, evaluates, appends a snapshot, and returns the snapshot summary. Provider failure appends `provider_error` without exposing exception text or credentials.

- [ ] **Step 6: Register models, router, migration metadata, and cleanup order**

Add snapshot and qualification tables before `watch_stocks` in demo cleanup; settings can be deleted after snapshots. Import all three models in `app.models` and Alembic metadata.

- [ ] **Step 7: Run API, migration, and cleanup tests**

Run: `cd backend && pytest tests/test_quant_strategies.py tests/test_chang_five_day_strategy.py tests/test_price_volume.py tests/test_demo_cleanup.py -q`

Run: `cd backend && alembic upgrade head && alembic downgrade d3e4f5a6b7c8 && alembic upgrade head`

Expected: all tests pass and both migration directions complete without data-definition errors.

- [ ] **Step 8: Commit persistence and API work**

```bash
git add backend/app/models/quant_strategy.py backend/app/schemas/quant_strategy.py backend/app/api/v1/quant_strategies.py backend/alembic/versions/e4f5a6b7c8d9_add_quant_strategy_plugins.py backend/app/models/__init__.py backend/app/api/v1/router.py backend/alembic/env.py backend/app/core/demo_cleanup.py backend/tests/test_quant_strategies.py
git commit -m "feat: add private quant strategy plugin API"
```

---

### Task 3: Quant Plugin Decision Surface

**Files:**
- Create: `frontend/src/app/quant/page.tsx`
- Create: `frontend/src/app/quant/QuantStrategyCard.tsx`
- Create: `frontend/src/app/quant/QuantStockList.tsx`
- Create: `frontend/src/app/quant/ThreeLowDialog.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/navigation.ts`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/quant-strategies.spec.ts`

**Interfaces:**
- Consumes: Task 2 typed JSON responses.
- Produces: responsive `/quant` manager, `QuantStrategy`, `QuantStrategyStock`, `QuantQualificationWrite`, and typed API methods.

- [ ] **Step 1: Write a failing Playwright flow**

The mocked flow opens `/quant`, enables the plugin, opens the three-low dialog for one stock, confirms all three conditions, starts scanning, observes progress from `0 / 2` to `2 / 2`, and verifies an `entry_breakout` result links to `/watchlist/{id}`. It also checks no horizontal overflow at 390, 834, and 1440 pixel viewports.

- [ ] **Step 2: Run the focused E2E test and verify the route is missing**

Run: `cd frontend && npx playwright test e2e/quant-strategies.spec.ts --project=mobile`

Expected: FAIL because `/quant` does not render the plugin heading.

- [ ] **Step 3: Add complete TypeScript contracts and API methods**

```ts
export type QuantSignal =
  | "entry_breakout" | "entry_pullback" | "risk_exit" | "hold_trend"
  | "trend_warning" | "watch" | "needs_qualification" | "not_eligible"
  | "insufficient_data" | "provider_error";

scanQuantStock: (strategyKey: string, stockId: number) =>
  request<QuantSignalSnapshot>(`/quant-strategies/${strategyKey}/stocks/${stockId}/scan`, { method: "POST" })
```

- [ ] **Step 4: Add the Decision navigation entry and translations**

Add `/quant` after candidates in `SECTION_NAV.decision`, include `/quant` in `AREA_PATHS.decision`, and add `nav.quantStrategies` in all base locale dictionaries. Add full `quant.*` English and Simplified Chinese feature messages; unsupported feature locales use the existing English fallback.

- [ ] **Step 5: Build the plugin card and bounded scan coordinator**

The plugin card shows exact fixed parameters, formula version, disclaimer, data boundary, enabled toggle, last scan summary, and one primary scan action. `scanAll` uses four client workers over the current stock rows, updates progress after every settled stock, preserves successful rows if another symbol fails, and never issues scans while disabled.

- [ ] **Step 6: Build the compact stock result list and qualification dialog**

Rows prioritize symbol, signal, bar date, close/MA5/volume ratio, and reasons. Filters cover attention-needed, entries, risks, and all. The dialog uses checkboxes for historical low, valuation low, and low attention plus a note; unchecked is explicit false, while untouched qualification remains null.

- [ ] **Step 7: Run frontend checks**

Run: `cd frontend && npx eslint src/app/quant src/lib/api.ts src/lib/types.ts src/lib/navigation.ts src/lib/i18n.ts src/lib/i18nFeatures.ts e2e/quant-strategies.spec.ts`

Run: `cd frontend && npx tsc --noEmit`

Run: `cd frontend && npx playwright test e2e/quant-strategies.spec.ts --project=desktop --project=tablet --project=mobile`

Expected: lint and typecheck are clean; all three E2E projects pass.

- [ ] **Step 8: Commit the decision surface**

```bash
git add frontend/src/app/quant frontend/src/lib/api.ts frontend/src/lib/types.ts frontend/src/lib/navigation.ts frontend/src/lib/i18n.ts frontend/src/lib/i18nFeatures.ts frontend/e2e/quant-strategies.spec.ts
git commit -m "feat: add quant plugin decision surface"
```

---

### Task 4: Stock Dossier Signal Integration and Final Verification

**Files:**
- Create: `frontend/src/app/watchlist/detail/QuantStrategyPanel.tsx`
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/watchlist-quant-signal.spec.ts`

**Interfaces:**
- Consumes: Task 3 quant API types and Task 2 latest stock result.
- Produces: a stock-specific auditable strategy block between price-volume observations and the K chart.

- [ ] **Step 1: Write a failing stock-dossier E2E test**

Mock an enabled plugin with an `entry_pullback` latest snapshot, open `/watchlist/115`, and assert the panel displays formula version, bar date, close, MA5, volume ratio, pullback basis, `next session open`, and a link to `/quant`. A scan button updates only this stock. Mobile assertions ensure controls stack without covering the K chart.

- [ ] **Step 2: Run the focused E2E test and verify the panel is absent**

Run: `cd frontend && npx playwright test e2e/watchlist-quant-signal.spec.ts --project=mobile`

Expected: FAIL because the stock dossier has no strategy heading.

- [ ] **Step 3: Implement a quiet stock-specific panel**

The panel fetches only persisted plugin state on load; it does not call Yahoo automatically. Disabled state links to `/quant`, missing qualification links to its configuration, and an enabled result exposes a manual rescan. Reason-code labels are mapped locally; raw provider errors are never displayed.

- [ ] **Step 4: Insert the panel without changing existing K-line behavior**

Render after `PriceVolumeObservation` and before `DailyKSection`. Keep existing `getPriceVolume` requests and chart moving averages unchanged.

- [ ] **Step 5: Run full focused verification**

Run: `cd backend && pytest tests/test_chang_five_day_strategy.py tests/test_quant_strategies.py tests/test_price_volume.py tests/test_demo_cleanup.py -q`

Run: `cd frontend && npx eslint src/app/quant src/app/watchlist/detail/QuantStrategyPanel.tsx src/app/watchlist/detail/WatchlistDetailView.tsx src/lib/api.ts src/lib/types.ts src/lib/navigation.ts src/lib/i18n.ts src/lib/i18nFeatures.ts e2e/quant-strategies.spec.ts e2e/watchlist-quant-signal.spec.ts`

Run: `cd frontend && npx tsc --noEmit`

Run: `cd frontend && npx playwright test e2e/quant-strategies.spec.ts e2e/watchlist-quant-signal.spec.ts --project=desktop --project=tablet --project=mobile`

Expected: all backend tests, static checks, and six browser projects pass with no viewport overflow.

- [ ] **Step 6: Verify real data conservatively**

Enable the plugin for `seekdemo`, confirm one demo stock's three-low qualification, scan it, and verify the response includes `source=yahoo_finance`, `strategy_version=1.0.0`, a completed `bar_date`, metrics, and reason codes. Do not bulk-confirm the other stocks.

- [ ] **Step 7: Commit final integration**

```bash
git add frontend/src/app/watchlist/detail/QuantStrategyPanel.tsx frontend/src/app/watchlist/detail/WatchlistDetailView.tsx frontend/src/lib/api.ts frontend/src/lib/i18nFeatures.ts frontend/e2e/watchlist-quant-signal.spec.ts docs/superpowers/plans/2026-08-16-five-day-line-quant-plugin.md
git commit -m "feat: surface quant evidence in stock dossiers"
```
