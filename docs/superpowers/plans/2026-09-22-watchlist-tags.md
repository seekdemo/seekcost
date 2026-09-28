# Watchlist tag fix and load verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Execute inline; that skill is unavailable in this session.

**Goal:** Remove overlapping industry/concept rendering errors and measure bounded local read concurrency.

**Architecture:** Deduplicate display labels without changing source classifications. Add overlapping labels to the quote regression fixture and assert no browser errors. Load only authenticated local read endpoints, not external quote providers.

**Tech Stack:** React, Playwright, Python httpx.

## Global Constraints

- Preserve all existing user changes and database content; no commit requested.
- Load levels 1/5/10/20 concurrent clients, 100 requests each; 10-second request timeout. Stop on errors.
- Development server results are local baselines, not production capacity guarantees.

## Steps

Execution completed inline on 2026-09-22. Regression failed before fix and passed
afterwards on all three screen sizes. TypeScript and four backend tests pass.
Live 346-stock smoke checks completed; 400 bounded read requests succeeded.
Detailed results and limitations: `docs/2026-09-22-watchlist-verification.md`.

- [ ] Add duplicate industry/concept fixture to `frontend/e2e/inline-market-quotes.spec.ts`; collect console errors and assert none. Run desktop test before fix.
- [ ] In `WatchlistClient.tsx`, return `[...new Set([...inferIndustryLabels(stock), ...inferConceptLabels(stock)])].join(" / ")` from themeSummary.
- [ ] Run quote regression at desktop/tablet/mobile plus TypeScript validation.
- [ ] Live demo browser smoke test and bounded read load; record p50/p95/error count in report.
