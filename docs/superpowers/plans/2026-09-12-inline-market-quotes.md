# Inline Market Quotes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Match the supplied compact sparkline / latest price / daily percentage reference in watchlist lists.

**Architecture:** An authenticated read-only endpoint returns a single regular trading session from Yahoo, with its own previous close and timestamps. A shared React component lazily loads visible quotes and renders all three aligned fields. Existing saved prices remain explicitly labeled fallback data.

**Tech Stack:** FastAPI, httpx, Next.js, React, SVG, Playwright.

## Global Constraints

- Preserve the dirty worktree, local services, existing authentication and data; no commits or deployment.
- Real intraday data only; unavailable change is not zero; no simulated ticks.
- Red up / green down; right-aligned tabular numbers; usable on mobile and desktop.
- Execute inline as requested by the user; unavailable executing-plans skill is replaced by the checkpoints below.

### Task 1: Bounded quote service

**Files:** Create `backend/app/core/market_quote.py`, `backend/tests/test_market_quote.py`; modify `backend/app/api/v1/prices.py`.

**Interfaces:** `async get_market_quote(symbol: str, market: str) -> dict`; returns price, previous_close, change_pct, points [{timestamp, price}], as_of, currency, source, status.

- [x] Add tests with a provider chart fixture: `assert normalize_quote(result)["change_pct"] == 10` for last 110 and previous close 100; missing previous close yields None.
- [x] Implement provider query1/query2 fallback, 60-second success / 20-second error cache, four concurrent fetches, deduplication, bounded cache. Only latest exchange-local session and finite positive prices are retained.
- [x] Expose `GET /prices/intraday-quote?symbol=...&market=...` behind existing current-user dependency, without database writes.
- [x] Run `.venv/bin/pytest tests/test_market_quote.py` from backend.

### Task 2: Compact quote presentation

**Files:** Create `frontend/src/components/MarketQuote.tsx`; modify `frontend/src/lib/api.ts`, `frontend/src/app/watchlist/WatchlistClient.tsx`, `frontend/src/app/globals.css`.

**Interfaces:** `MarketQuote({symbol, market, fallbackPrice})`; endpoint fields from Task 1. `MarketQuoteHeading` aligns the same three columns.

- [x] Use IntersectionObserver to fetch visible rows, deduplicate pending requests, refresh visible rows at 60 seconds only when document is visible, clean up observers/timers.
- [x] Render SVG path and subtle fill with previous-close dashed baseline; use actual time coordinates, never random or daily OHLC data.
- [x] Always render latest price and daily percentage side by side, signed and red/green; missing values show dashes and unavailable status.
- [x] Replace QuoteCell for all funnel stages, adjust desktop widths and mobile quote row to span available width; preserve row selection/navigation.

### Task 3: Verification

**Files:** Create `frontend/e2e/inline-market-quotes.spec.ts`.

- [x] Mock positive/negative/unavailable provider data and assert SVG baseline, signed percentage and fallback state; save screenshots at desktop, tablet and mobile widths.
- [x] Run `npx tsc --noEmit` and the new Playwright test across all three projects.
- [x] Inspect screenshots and verify actual authenticated provider response and page where available; report provider limitations honestly.
