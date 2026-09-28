# Trading Opportunity Cockpit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganize the private quant workbench around the operator's immediate question: which symbols have an entry setup, which must keep waiting, which are extended, and which require risk handling.

**Architecture:** Keep each private strategy responsible for deterministic evidence and add a cockpit-only classification layer that merges the latest saved completed-bar snapshots into one disposition per symbol. Render four decision lanes plus a searchable evidence table; never fetch market data from the workbench and never turn evidence into an automatic order or recommendation.

**Tech Stack:** FastAPI, SQLAlchemy async, Pydantic-backed snapshot payloads, Next.js 16, React, TypeScript, CSS, pytest, Playwright.

## Global Constraints

- Use saved completed daily bars only; opening the workbench must not request market data.
- Quant evidence is private to the current user and must not be exposed across users.
- Do not auto-trade and do not present deterministic rules as AI predictions or investment advice.
- A symbol appears in exactly one operator disposition.
- Risk overrides extended, extended overrides entry, and entry overrides watch.
- Unusual volume is confirmation evidence only and must never create an entry disposition by itself.
- Preserve English as the default locale and keep Simplified Chinese translations complete.
- Desktop and 390px mobile layouts must have no horizontal overflow.

---

### Task 1: Operator Classification Contract

**Files:**
- Modify: `backend/tests/test_workbench_quant.py`
- Modify: `backend/app/core/quant_cockpit.py`
- Modify: `frontend/src/lib/types.ts`

**Interfaces:**
- Consumes: latest saved `QuantSignalSnapshot` rows already grouped by stock and strategy.
- Produces: `disposition`, `decision_reason`, `next_step`, `confirmation_count`, `has_entry`, and `has_extended` on every cockpit stock; disposition counts in `summary`.

- [x] **Step 1: Write failing classification assertions**

Add fixtures for entry, target/extended, risk, watch, unusual-volume-only, and incomplete-data symbols. Assert the override order and that volume alone remains `watch`.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `/path/to/user/miniconda3/envs/seek/bin/pytest -q tests/test_workbench_quant.py`

Expected: FAIL because the disposition contract does not exist.

- [x] **Step 3: Implement deterministic classification**

Add a pure `_classify_stock(signals)` helper with the fixed precedence from Global Constraints. Include compact reason and next-step codes so copy remains localized in the frontend.

- [x] **Step 4: Run the focused test and verify it passes**

Run: `/path/to/user/miniconda3/envs/seek/bin/pytest -q tests/test_workbench_quant.py`

Expected: PASS.

### Task 2: Decision-Lane Workbench

**Files:**
- Modify: `frontend/src/app/workbench/QuantCockpit.tsx`
- Modify: `frontend/src/lib/i18nWorkbench.ts`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: the Task 1 cockpit contract.
- Produces: four decision lanes, disposition filters, compact three-part evidence, and direct links to the stock dossier.

- [x] **Step 1: Replace event-centric metrics**

Show entry candidates, continued observation, extended/high, and risk handling counts. Keep data freshness and data issues secondary.

- [x] **Step 2: Build four exclusive decision lanes**

Each lane displays the highest-priority symbols, its reason, current/reference price distance, and the next condition to check. Never display the same symbol twice.

- [x] **Step 3: Reframe the complete monitor**

Filter by disposition instead of generic trigger/change states. Keep the search directly above the list and show price, trend, and volume evidence without requiring a detail-page visit.

- [x] **Step 4: Complete bilingual copy and responsive styling**

Use plain action language: `Entry setup`, `Keep watching`, `Extended`, `Risk action`, and localized equivalents. Stack lanes and evidence vertically on mobile with at least 44px touch controls.

### Task 3: Regression and Visual Verification

**Files:**
- Modify: `frontend/e2e/personal-investment-flow.spec.ts`
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**
- Consumes: rendered Task 2 workbench.
- Produces: regression coverage for labels, exclusive lane layout, mobile stacking, filter placement, and viewport containment.

- [x] **Step 1: Update semantic assertions**

Assert the four operator lanes and the all-symbol monitor exist and the old event-first headings are not the primary dashboard.

- [x] **Step 2: Run desktop and mobile Playwright tests**

Run: `npx playwright test e2e/personal-investment-flow.spec.ts --project=desktop --project=mobile -g 'workbench exposes'`

Expected: PASS with no horizontal overflow.

- [x] **Step 3: Run backend and frontend quality gates**

Run backend focused tests, `npx tsc --noEmit --incremental false`, `npm run lint`, `npm run build`, and `git diff --check`.

- [x] **Step 4: Inspect the live page**

Verify the desktop decision lanes, the 390px mobile stack, search/filter ergonomics, and an empty browser error console at `http://localhost:3000`.
