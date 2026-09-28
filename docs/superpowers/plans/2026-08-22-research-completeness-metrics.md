# Research Completeness Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate research writing progress from structured review readiness so AI-pasted research such as AAOI is measured accurately.

**Architecture:** Keep the calculation in the research detail client boundary, using the existing five research sections. Content completeness counts sections with non-empty summaries; review readiness counts four structured checks per section: evidence, open questions, reviewed date and next review date. The summary surface will show both percentages and their concrete counts without changing persisted data.

**Tech Stack:** Next.js App Router, React, TypeScript, existing i18n dictionaries, Playwright.

## Global Constraints

- Preserve existing research content and section data.
- Do not change the private research API or database schema.
- Keep the full-section completion rule for navigation and the “open first gap” action.
- Default interface copy remains English with Chinese localization.

### Task 1: Add Separate Research Metrics

**Files:**
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/app/watchlist/detail/DecisionSummary.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`

- [x] Define content completeness as non-empty section summaries divided by five.
- [x] Define review readiness as completed evidence, open-question, reviewed-date and next-review-date checks divided by twenty.
- [x] Pass both percentages and concrete completed/total counts to `DecisionSummary`.
- [x] Render the two metrics with localized labels and count details.

### Task 2: Cover AAOI-Style Content in End-to-End Tests

**Files:**
- Modify: `frontend/e2e/watchlist-detail-research.spec.ts`

- [x] Add a fixture/profile with three populated summaries and empty structured review fields.
- [x] Assert that the detail page displays `60%` content completeness and `0%` review readiness.
- [x] Assert the visible count details are `3 / 5` and `0 / 20` in English.

### Task 3: Verify the Frontend

**Files:**
- No additional files.

- [ ] Run the focused research detail Playwright test against a healthy local frontend instance (blocked by the current port-3000 auth redirect).
- [x] Run `npm run lint` and `npx tsc --noEmit` from `frontend`.
- [x] Run `git diff --check` for all changed files.
