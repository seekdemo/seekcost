# Quant Monitoring Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the general-purpose investment workbench with a private, completed-bar quant monitoring cockpit that consolidates each stock's enabled strategy evidence into one actionable row.

**Architecture:** Keep the existing `/workbench/overview` compatibility fields for the decision page and add a `quant_cockpit` payload built by a focused backend service. The service reads only saved snapshots, compares the latest two distinct completed-bar snapshots for each enabled strategy and stock, and returns summary counts, priority rows, market coverage, strategy health, and a searchable consolidated stock list. The homepage becomes a responsive cockpit and never fetches market data itself.

**Tech Stack:** FastAPI, SQLAlchemy async, SQLite/PostgreSQL-compatible queries, pytest, Next.js 16, React 19, TypeScript, Tailwind CSS.

## Global Constraints

- Use only saved snapshots generated from completed daily bars; opening or refreshing the workbench must never request market data.
- Keep every query scoped to `current_user.id` and that user's watchlist and strategy settings.
- Show only enabled strategies in cockpit evidence and coverage.
- Never describe a signal as a buy/sell recommendation and never place a trade.
- Consolidate one stock into one row even when several strategies trigger.
- Compare the latest two distinct `bar_date` snapshots, so same-session manual rescans do not create false changes.
- Treat the three-day volume ratio as a measurement; it enters the trigger queue only when `volume_ratio_3d >= 1.45`, labeled as unusual volume rather than an entry signal.
- Preserve the existing workbench response fields used by `/decision`.
- English remains the default; all new visible copy has a Simplified Chinese translation and other locales fall back to English.
- Desktop and mobile layouts must not overflow at 1280px and 390px widths.

---

### Task 1: Saved-snapshot cockpit aggregation

**Files:**
- Create: `backend/app/core/quant_cockpit.py`
- Modify: `backend/app/api/v1/workbench.py`
- Modify: `backend/tests/test_workbench_quant.py`

**Interfaces:**
- Consumes: `WatchStock`, `QuantStrategySetting`, `QuantSignalSnapshot`, and the three registered strategy keys.
- Produces: `build_quant_cockpit(db: AsyncSession, user_id: int, stocks: list[WatchStock]) -> dict`.
- Adds: `quant_cockpit` to `GET /api/v1/workbench/overview` while preserving `quant_monitoring` and all legacy fields.

- [ ] **Step 1: Extend the backend test with distinct-bar history**

Create latest and previous snapshots for the same strategy and stock, plus a same-bar rescan. Assert the previous signal comes from the previous distinct bar, the stock appears once, and another user's rows never appear.

- [ ] **Step 2: Add exact classification assertions**

Assert risk signals produce `level=risk`; entry and price-anchor zones produce `level=trigger`; `volume_ratio_3d=1.45` produces an unusual-volume trigger; provider errors produce data issues; and a changed signal records `previous_signal` and `changed=true`.

- [ ] **Step 3: Run the focused test and verify failure**

Run:

```bash
cd backend
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q tests/test_workbench_quant.py
```

Expected: failure because `quant_cockpit` does not exist.

- [ ] **Step 4: Implement the cockpit service**

Use enabled strategy settings only. Select the latest snapshot for each distinct `(strategy_key, stock_id, bar_date)`, retain the latest two distinct bars, then build:

```text
enabled_strategy_count
watchlist_count
scanned_stock_count
last_evaluated_at
summary: risk_count, trigger_count, change_count, data_issue_count, unscanned_count
market_sessions[]: market, bar_date, scanned_count, total_count
strategies[]: strategy_key, scanned_count, total_count, trigger_count, risk_count, change_count, data_issue_count, last_bar_date, last_evaluated_at
priority_items[]
stocks[]
```

Each stock item contains identity, market, stage, `level`, `changed`, one `headline`, and every enabled strategy's latest evidence. Sort by risk, trigger, change, data issue, then normal; within a level sort changed rows first and symbols alphabetically.

- [ ] **Step 5: Connect the service to the existing endpoint**

Call `build_quant_cockpit` after loading the current user's watchlist. Do not remove the old investment and decision aggregates because `/decision` still consumes them.

- [ ] **Step 6: Run focused and full backend tests**

Run:

```bash
cd backend
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q tests/test_workbench_quant.py tests/test_quant_strategies.py
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q
```

Expected: all pass.

### Task 2: Responsive quant cockpit homepage

**Files:**
- Create: `frontend/src/app/workbench/QuantCockpit.tsx`
- Create: `frontend/src/lib/i18nWorkbench.ts`
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/e2e/personal-investment-flow.spec.ts`
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**
- Consumes: `WorkbenchOverview.quant_cockpit` from Task 1.
- Produces: a compact cockpit header, market-session strip, four summary metrics, priority queue, strategy health, and searchable/filterable consolidated stock rows.

- [ ] **Step 1: Add complete TypeScript contracts**

Define `QuantCockpitLevel`, `QuantCockpitEvidence`, `QuantCockpitStock`, `QuantCockpitStrategy`, `QuantCockpitMarketSession`, and `QuantCockpit`, then add optional `quant_cockpit` to `WorkbenchOverview` for compatibility with mocked older responses.

- [ ] **Step 2: Add English and Simplified Chinese copy**

Create a focused workbench translation module. Copy must call the page “Quant monitoring cockpit” / “量化监控驾驶舱”, explain that it uses completed-bar evidence, distinguish risk, triggers, changes and data issues, and label the volume threshold as unusual volume rather than a trade signal.

- [ ] **Step 3: Replace the homepage composition**

Keep `AuthGuard`, loading, retry, refresh, and links to `/quant`, `/watchlist`, `/portfolio`, and `/decision`. Remove the current capital pulse, research agenda, maintenance list, and generic quick-action grid from the homepage render.

- [ ] **Step 4: Build the priority and strategy panels**

The priority list shows the strongest evidence first, a previous-to-current transition when changed, the actual reason, completed bar date, close/reference/gap or volume ratio, and additional strategy badges without duplicating the stock. The strategy panel shows coverage and counts, not full rule descriptions.

- [ ] **Step 5: Build the consolidated monitor**

Place symbol/company search directly above the rows. Add filters `All`, `Risk`, `Triggered`, `Changed`, and `Data issues`. Each row opens `/watchlist/[id]` in a new tab and shows only concise evidence. Empty and no-enabled-strategy states provide direct routes to `/watchlist` and `/quant`.

- [ ] **Step 6: Add responsive constraints**

At desktop widths use a priority/strategy split and table-like rows. At 390px use a two-by-two summary, horizontally scrollable market sessions, stacked evidence, 44px controls, and no horizontal document overflow.

- [ ] **Step 7: Update browser assertions**

Replace old workbench headings with the cockpit title plus `Priority signals`, `Strategy health`, and `All monitored symbols`. Preserve the viewport-overflow assertion.

- [ ] **Step 8: Run frontend checks**

Run:

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

Expected: all pass.

### Task 3: Browser and final verification

**Files:**
- Verify: `frontend/src/app/page.tsx`
- Verify: `frontend/src/app/workbench/QuantCockpit.tsx`
- Verify: `backend/app/core/quant_cockpit.py`

**Interfaces:**
- Consumes: the running frontend on port `3000` and backend on port `8001`.
- Produces: a visually checked, non-overflowing cockpit with no browser console errors.

- [ ] **Step 1: Verify desktop layout at 1280x900**

Confirm summary metrics stay on one row, priority and strategy panels align, search precedes the full monitor, evidence does not overflow, and every stock is represented once.

- [ ] **Step 2: Verify mobile layout at 390x844**

Confirm the header remains compact, summary becomes two columns, market sessions remain reachable, filters are thumb-friendly, rows stack cleanly, and the document width does not exceed the viewport.

- [ ] **Step 3: Verify runtime behavior**

Confirm refresh reloads saved results only, filters and search work together, stock links target a new tab, and disabled/no-data states remain actionable.

- [ ] **Step 4: Run final checks**

Run:

```bash
git diff --check
cd backend && /path/to/user/miniconda3/envs/seek/bin/python -m pytest -q
cd ../frontend && npx tsc --noEmit && npm run lint && npm run build
```

Expected: all pass.
