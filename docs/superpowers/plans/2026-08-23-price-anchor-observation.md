# Price Anchor Observation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add one private, auditable price-anchor observation strategy that automatically checks completed daily bars for strike, fair-value, target, market-baseline, and risk conditions without changing saved anchors or placing trades.

**Architecture:** Register `price-anchor-observation` beside the existing built-in strategies. A provider-independent evaluator calculates all reference levels and returns one priority signal plus an auditable metric snapshot. Manual scans use the existing endpoint; a small background monitor evaluates enabled users once per completed market session and stores at most one snapshot per stock and bar. The quant page and workbench surface the same saved snapshots without requesting market data.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic, pytest, Next.js 16, React 19, TypeScript.

## Global Constraints

- Strategy key is exactly `price-anchor-observation`; initial strategy version is exactly `1.0.0`.
- Use completed daily bars only. Never make a claim from an incomplete same-session bar.
- Never overwrite `strike_price`, `fair_price`, or `target_price` during evaluation or scanning.
- Never place a trade, publish an investment recommendation, or describe a technical baseline as intrinsic value.
- Saved user anchors remain historical decision inputs; moving averages, VWAP, ATR, support, and resistance remain dynamic observations.
- All settings, watchlist stocks, and snapshots remain scoped to `current_user.id`.
- Reuse `quant_strategy_settings` and `quant_signal_snapshots`; do not add or delete database tables.
- Automatic monitoring stores at most one successful snapshot per strategy, stock, and completed bar. Manual rescans of the same unchanged bar return that snapshot.
- Provider failures expose only `provider_error` and `market_data_unavailable`; never return raw exception text.
- English remains the default language and every new visible string has a Simplified Chinese translation.

---

### Task 1: Provider-independent price-anchor evaluator

**Files:**
- Create: `backend/app/core/quant_strategies/price_anchor.py`
- Modify: `backend/app/core/quant_strategies/__init__.py`
- Modify: `backend/app/schemas/quant_strategy.py`
- Test: `backend/tests/test_price_anchor_strategy.py`

**Interfaces:**
- Consumes: `list[DailyBarInput]`, `PriceAnchors`, and the existing `build_price_volume_observation` calculations.
- Produces: `PRICE_ANCHOR_STRATEGY_KEY`, `PRICE_ANCHOR_STRATEGY_VERSION`, `PRICE_ANCHOR_DEFAULT_PARAMETERS`, `PriceAnchorMetrics`, `PriceAnchorResult`, and `evaluate_price_anchor`.

- [ ] **Step 1: Write evaluator tests**

Cover these exact rules with deterministic OHLCV fixtures:

```python
assert evaluate_price_anchor(bars, PriceAnchors(strike_price=90)).signal == "anchor_strike_zone"
assert evaluate_price_anchor(bars, PriceAnchors(fair_price=100)).signal == "anchor_fair_zone"
assert evaluate_price_anchor(bars, PriceAnchors(target_price=110)).signal == "anchor_target_zone"
assert evaluate_price_anchor(risk_bars, PriceAnchors()).signal == "anchor_risk"
assert evaluate_price_anchor(deviation_bars, PriceAnchors()).signal == "market_baseline_deviation"
assert evaluate_price_anchor(short_bars, PriceAnchors()).signal == "insufficient_data"
```

Also assert the evaluator does not mutate the input anchors, uses the latest completed bar as `bar_date`, and returns `execution_timing=None`.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run:

```bash
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q tests/test_price_anchor_strategy.py
```

Expected: import failure because the evaluator does not exist.

- [ ] **Step 3: Implement parameters, metrics, and signal priority**

Use these exact defaults:

```python
PriceAnchorParameters(
    anchor_proximity_pct=0.02,
    resistance_proximity_pct=0.02,
    baseline_deviation_pct=0.05,
    ma5_upper_atr=0.2,
    ma5_lower_atr=0.5,
    risk_buffer_pct=0.075,
)
```

Rules use the latest close and the previous completed close where needed:

```text
anchor_risk:
  close <= MA5 * (1 - 0.075)

anchor_target_zone:
  close >= saved target price
  OR close >= 20-day resistance * (1 - 0.02)
  OR close >= 60-day resistance * (1 - 0.02)
  OR close >= saved strike price + 2 * ATR14

anchor_strike_zone:
  close <= saved strike price
  OR MA5 is rising AND MA5 - 0.5*ATR14 <= close <= MA5 + 0.2*ATR14
  OR abs(close / 60-day support - 1) <= 0.02

anchor_fair_zone:
  abs(close / saved fair price - 1) <= 0.02

market_baseline_deviation:
  abs(close / VWAP20 - 1) >= 0.05
  OR abs(close / VWAP60 - 1) >= 0.05
  OR abs(close / MA60 - 1) >= 0.05

anchor_watch:
  none of the conditions above
```

Return only the reason codes belonging to the highest-priority signal. Priority is exactly risk, target, strike, fair, baseline deviation, watch. Require at least 21 completed bars; shorter inputs return `insufficient_data` with `insufficient_anchor_history`.

Metrics contain the close, all three saved anchors, MA5, MA60, ATR14, VWAP20, VWAP60, 20/60-day support or resistance, MA5 risk line, MA5 ATR pullback bounds, strike-plus-2-ATR target, and percentage gaps to the saved fair price and market baselines.

- [ ] **Step 4: Extend signal contracts and exports**

Add these exact signals to backend and frontend-compatible contracts:

```text
anchor_strike_zone
anchor_fair_zone
anchor_target_zone
anchor_risk
market_baseline_deviation
anchor_watch
```

- [ ] **Step 5: Run focused and existing evaluator tests**

Run:

```bash
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q tests/test_price_anchor_strategy.py tests/test_price_volume.py tests/test_chang_five_day_strategy.py tests/test_volume_ratio_strategy.py
```

Expected: all pass.

### Task 2: Strategy registry, manual scans, and once-per-session background monitoring

**Files:**
- Create: `backend/app/core/price_anchor_monitor.py`
- Modify: `backend/app/api/v1/quant_strategies.py`
- Modify: `backend/app/core/price_scheduler.py`
- Test: `backend/tests/test_quant_strategies.py`
- Test: `backend/tests/test_price_anchor_monitor.py`

**Interfaces:**
- Consumes: Task 1 evaluator and existing `QuantStrategySetting`, `QuantSignalSnapshot`, `WatchStock`, `fetch_daily_bars`, and `completed_daily_bars`.
- Produces: registered strategy API output, `scan_price_anchor_stock`, and `scan_due_price_anchor_stocks`.

- [ ] **Step 1: Write failing registry and scan tests**

Assert the strategy list contains the new key and version, disabled by default for each user. After enabling it, a stock scan must return a typed price-anchor signal, retain the stock's three saved anchors unchanged, remain owner-scoped, sanitize provider errors, and reuse the existing snapshot on an unchanged completed bar.

- [ ] **Step 2: Write failing background-monitor tests**

Use an in-memory SQLite database and a stub market provider. Assert:

```text
disabled strategy -> no provider calls and no snapshots
enabled strategy -> every owned watchlist stock is evaluated
same completed session cutoff -> no second provider call
next completed session cutoff -> one new snapshot per stock
another user's stocks -> never evaluated under the first user's setting
provider failure -> sanitized provider_error snapshot
```

- [ ] **Step 3: Register the strategy and route manual scans through the monitor service**

Expose fixed parameters, disclaimer `Observation only. This is not investment advice.`, and data boundary `Uses completed daily bars only; enabled strategies are checked automatically after each market session.` Manual scan remains available as an immediate refresh and never changes a saved price anchor.

- [ ] **Step 4: Implement completed-session due calculation**

Use exchange-local cutoffs:

```python
MARKET_SESSION_CUTOFFS = {
    "us": ("America/New_York", time(16, 15)),
    "hk": ("Asia/Hong_Kong", time(16, 15)),
    "cn": ("Asia/Shanghai", time(15, 15)),
    "cn_index": ("Asia/Shanghai", time(15, 15)),
    "tw": ("Asia/Taipei", time(13, 45)),
    "crypto": ("UTC", time(0, 15)),
}
```

Before today's cutoff, compare with the previous weekday cutoff; after it, compare with today's cutoff. Crypto does not skip weekends. A successful or insufficient-data snapshot evaluated after the relevant cutoff is not fetched again. A provider-error snapshot may retry after three hours.

- [ ] **Step 5: Integrate with the existing scheduler**

After the hourly price refresh, call `scan_due_price_anchor_stocks(db)`. Limit provider concurrency to four. Persist results sequentially through the shared async session and log only aggregate counts.

- [ ] **Step 6: Run backend integration and full backend tests**

Run:

```bash
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q tests/test_price_anchor_monitor.py tests/test_quant_strategies.py
/path/to/user/miniconda3/envs/seek/bin/python -m pytest -q
```

Expected: all pass.

### Task 3: Quant monitor and workbench presentation

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/i18nQuant.ts`
- Modify: `frontend/src/app/quant/page.tsx`
- Modify: `frontend/src/app/quant/QuantStrategyCard.tsx`
- Modify: `frontend/src/app/quant/QuantStockList.tsx`
- Modify: `backend/app/api/v1/workbench.py`
- Modify: `frontend/src/app/page.tsx`
- Test: existing frontend checks and backend workbench coverage

**Interfaces:**
- Consumes: Task 2 API strategy definition and saved snapshot metrics.
- Produces: responsive third strategy tab, strategy rules, anchor-specific result rows, and workbench trigger links.

- [ ] **Step 1: Extend TypeScript signal and metric types**

Add the six Task 1 signals and optional metric fields matching the backend JSON names. Add `strategy_key` to each workbench quant signal so rows from different strategies have stable unique keys.

- [ ] **Step 2: Add English and Simplified Chinese copy**

Name the plugin `Price anchor observation` / `价格锚点观察策略`. Explain that it monitors saved anchors and dynamic market references after completed sessions, does not calculate intrinsic value, does not overwrite anchors, and does not trade automatically. Add concise signal and reason labels for every Task 1 code.

- [ ] **Step 3: Render the third strategy without adding a separate page**

Use a responsive two-column switcher at `sm` and three columns at `xl`. For the new strategy, rules show the exact thresholds from Task 1. The enabled state says automatic monitoring is active; the existing scan button remains an immediate manual refresh.

- [ ] **Step 4: Render simple anchor-monitor results**

Default to the attention/trigger view. Filters remain All, Needs attention, Triggered, and Risk. Rows show only close, the nearest relevant reference, and the percentage gap; the reason line explains the actual trigger. Risk is red, strike is green, target is blue, fair is violet, baseline deviation is amber, and watch is neutral. Stock links continue opening in a new tab.

- [ ] **Step 5: Surface saved triggers on the workbench**

Read latest snapshots for the five-day and price-anchor strategies without requesting market data. Include `anchor_risk` in attention; include strike, fair, target, and market-baseline signals in matches. Preserve current user isolation and use `strategy_key` in frontend row keys.

- [ ] **Step 6: Verify responsive UI and production checks**

Run:

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm run build
```

Use the local browser to verify `/quant` at 1280px and 390px widths: three strategy choices remain readable, search remains above results, trigger rows do not overflow, and enabling or scanning remains explicit.

Finally run:

```bash
git diff --check
```
