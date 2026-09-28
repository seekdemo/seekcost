# Intraday Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated intraday warning layer to the quant workbench while preserving close-confirmed daily signals as the only formal decision output.

**Architecture:** Yahoo chart data is fetched as short-interval bars and normalized in `market_history.py`. A pure `intraday_monitor.py` module compares the current session with completed daily bars, price anchors, and optional position risk; it returns provisional evidence only. A user-scoped `GET /workbench/intraday-preview` endpoint aggregates watchlist rows without writing `QuantSignalSnapshot`, and the workbench renders a separately labeled, manually refreshable preview section.

**Tech Stack:** FastAPI, SQLAlchemy async, httpx, Python dataclasses/dicts, Next.js React, TypeScript, existing i18n and CSS utility conventions, pytest and Playwright.

## Global Constraints

- Formal entry, watch, extended, and risk dispositions remain based only on completed daily bars.
- Intraday output is always labeled provisional / pending close confirmation and never writes or overwrites `QuantSignalSnapshot`.
- Intraday volume comparison uses cumulative volume at the same session time over the previous three sessions, never full-day volume divided by a partial day.
- All data is scoped to the authenticated user’s watchlist; provider failures are returned per symbol and do not fail the whole response.
- No automatic trading, recommendation claims, BLEX integration, or new third-party paid data dependency.
- Default refresh is manual with a five-minute client polling floor; mobile layouts must not horizontally overflow.

---

### Task 1: Normalize intraday market data

**Files:**
- Modify: `backend/app/core/market_history.py`
- Test: `backend/tests/test_market_history.py` (create if absent)

**Interfaces:**
- Produces `fetch_intraday_bars(symbol: str, market: str, interval: str = "5m", range_key: str = "1d") -> dict` with `items` containing `timestamp`, `open`, `high`, `low`, `close`, `volume`, plus `exchange_timezone` and `currency`.
- Produces `completed_session_key(timestamp, exchange_timezone) -> str` and `intraday_cumulative_volume(items, exchange_timezone, now) -> tuple[str | None, float | None]` helpers for same-session alignment.

- [ ] **Step 1: Write failing provider and alignment tests**

```python
def test_intraday_parser_returns_normalized_bars(monkeypatch):
    payload = {"chart": {"result": [{"timestamp": [1], "indicators": {"quote": [{"open": [10], "high": [11], "low": [9], "close": [10.5], "volume": [120]}]}, "meta": {"exchangeTimezoneName": "America/New_York"}}]}}
    monkeypatch.setattr("app.core.market_history.httpx.Client", fake_client(payload))
    result = fetch_intraday_bars("AAPL", "us")
    assert result["items"] == [{"timestamp": 1, "open": 10.0, "high": 11.0, "low": 9.0, "close": 10.5, "volume": 120}]

def test_cumulative_volume_uses_same_session_key():
    items = [{"timestamp": 1710345600, "volume": 10}, {"timestamp": 1710349200, "volume": 30}]
    assert intraday_cumulative_volume(items, "America/New_York", datetime.fromtimestamp(1710349200, timezone.utc))[1] == 40
```

- [ ] **Step 2: Run the focused tests and verify they fail**

Run: `cd backend && pytest tests/test_market_history.py -q`

Expected: import/function failures because intraday helpers do not exist.

- [ ] **Step 3: Implement the Yahoo chart request and normalization**

Use `interval=5m`, `range=1d`, `includePrePost=false`, preserve the provider timezone, skip incomplete OHLC rows, and return an empty `items` array for an empty provider result. Reject unsupported intervals/ranges by falling back to `5m`/`1d`.

- [ ] **Step 4: Implement session/time alignment helpers**

Convert timestamps to the exchange timezone, group by local trading date, and compute the latest session’s cumulative volume through the latest bar timestamp. Return `None` when fewer than one valid bar exists.

- [ ] **Step 5: Run the focused tests and verify they pass**

Run: `cd backend && pytest tests/test_market_history.py -q`

Expected: PASS.

### Task 2: Build pure intraday warning evaluation

**Files:**
- Create: `backend/app/core/intraday_monitor.py`
- Test: `backend/tests/test_intraday_monitor.py`

**Interfaces:**
- Produces `evaluate_intraday_preview(*, symbol, market, intraday_items, daily_bars, current_price, strike_price, fair_price, target_price, position_cost=None, position_quantity=0, now=None) -> dict`.
- Returned dict contains `status`, `warning_code`, `severity`, `is_provisional=True`, `evidence`, `session`, and `error_code` fields.

- [ ] **Step 1: Write failing behavior tests**

Cover: price near strike returns `near_strike`, price near MA5 risk buffer returns `near_risk_line`, same-time cumulative volume at or above 1.45 returns `unusual_volume`, no intraday bars returns `data_unavailable`, and every non-error result has `is_provisional is True` and `status == "pending_close"`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_intraday_monitor.py -q`

Expected: FAIL because the evaluator is absent.

- [ ] **Step 3: Implement deterministic warning precedence**

Use precedence `data_unavailable` > `near_position_stop` > `near_risk_line` > `near_strike` > `near_fair_value` > `near_target` > `unusual_volume` > `quiet`. Compute MA5 and its 7.5% buffer from completed daily closes only. Compare intraday cumulative volume with the average cumulative volume at the closest matching minute bucket from the preceding three completed sessions; omit the volume warning if fewer than two aligned sessions exist.

- [ ] **Step 4: Run tests and verify they pass**

Run: `cd backend && pytest tests/test_intraday_monitor.py -q`

Expected: PASS.

### Task 3: Add user-scoped preview API

**Files:**
- Modify: `backend/app/api/v1/workbench.py`
- Modify: `backend/app/core/market_history.py` imports as needed
- Test: `backend/tests/test_workbench_intraday.py`

**Interfaces:**
- Adds `GET /api/v1/workbench/intraday-preview` returning `{generated_at, is_market_open, items, provider_errors}`.
- Each item includes `stock_id`, `symbol`, `name`, `market`, `current_price`, `status`, `warning_code`, `severity`, `is_provisional`, `session`, `evidence`, and `error_code`.

- [ ] **Step 1: Write failing access and aggregation tests**

Assert only the current user’s `WatchStock` rows are queried, provider errors produce an item-level `data_unavailable`, and no `QuantSignalSnapshot` row is inserted or updated.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd backend && pytest tests/test_workbench_intraday.py -q`

Expected: FAIL with 404 or missing implementation.

- [ ] **Step 3: Implement the endpoint**

Load watchlist rows and the user’s latest price-anchor settings; fetch intraday data in bounded concurrency (`asyncio.gather` over at most 24 symbols per request), call the pure evaluator, and catch provider exceptions per symbol. Use `WatchStock.current_price` as the quote fallback. Do not call or mutate the daily scan path.

- [ ] **Step 4: Run API tests and existing quant tests**

Run: `cd backend && pytest tests/test_workbench_intraday.py tests/test_workbench_quant.py tests/test_quant_strategies.py -q`

Expected: PASS.

### Task 4: Add typed client and i18n contracts

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/i18nWorkbench.ts`

**Interfaces:**
- Adds `IntradayPreviewItem`, `IntradayPreview`, and `api.getWorkbenchIntradayPreview()`.
- Adds English and Chinese strings for provisional status, pending close, warnings, refresh, provider unavailable, and empty state.

- [ ] **Step 1: Add exact TypeScript interfaces matching Task 3**

Keep numeric fields nullable and use string unions for `status`, `warning_code`, and `severity`; do not use `Record<string, unknown>`.

- [ ] **Step 2: Add API method and translations**

Use `request<IntradayPreview>("/workbench/intraday-preview")`; include short, action-oriented English defaults and equivalent Chinese copy.

- [ ] **Step 3: Run TypeScript validation**

Run: `cd frontend && npx tsc --noEmit --incremental false`

Expected: PASS.

### Task 5: Render the isolated intraday preview panel

**Files:**
- Create: `frontend/src/app/workbench/IntradayPreview.tsx`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- `IntradayPreview` accepts `data`, `loading`, `onRefresh`, `t`, and `localeTag`.
- It renders a clearly separated “Intraday preview / Pending close confirmation” region above the formal cockpit lanes.

- [ ] **Step 1: Write the component states**

Implement loading skeleton, unavailable-per-symbol rows, empty watchlist state, warning severity badges, current price and distance evidence, a manual refresh button, and a five-minute cooldown indicator. Link symbols to `/watchlist/:id` in a new tab.

- [ ] **Step 2: Add responsive styles**

Use a one-column card on narrow screens, compact two-column rows on desktop, `min-width: 0`, wrapping evidence chips, and no fixed-width overflow. Visually distinguish provisional amber/blue states from formal green/red cockpit states.

- [ ] **Step 3: Fetch and mount from the workbench page**

Load the preview independently from `/workbench/overview`; a preview failure must leave the formal cockpit usable. Refresh only the preview when its button is pressed or when the five-minute interval expires.

- [ ] **Step 4: Run lint, typecheck, and build**

Run: `cd frontend && npm run lint && npx tsc --noEmit --incremental false && npm run build`

Expected: PASS.

### Task 6: Regression and responsive verification

**Files:**
- Modify: `frontend/e2e/personal-investment-flow.spec.ts`
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`
- Modify: `backend/tests/test_workbench_quant.py` only if shared fixtures need an explicit no-snapshot assertion

- [ ] **Step 1: Add Playwright coverage**

Verify the panel is visible and labeled provisional, formal lane counts remain present, refresh failure does not hide formal content, and viewports 390px, 768px, and 1440px have no horizontal overflow.

- [ ] **Step 2: Run the complete focused verification**

Run: `cd backend && pytest -q`; `cd frontend && npm run lint && npx tsc --noEmit --incremental false && npm run build`; then run the two targeted Playwright specs against the local services.

- [ ] **Step 3: Inspect the diff for scope and privacy**

Run: `git diff --check` and `git status --short`; confirm no BLEX references, no new persisted intraday snapshot writes, and no unrelated file cleanup.
