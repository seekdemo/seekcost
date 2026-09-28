# Decision inbox Implementation Plan

> Execute sequentially inline; executing-plans skill unavailable. User requested page redesign, not data changes.

**Goal:** Replace the overloaded decision dashboard with a focused actionable inbox.
**Architecture:** `/decision` uses three persistent panels (pending, records, review). Build typed queue items from existing overview arrays; retain every existing destination. Keep review mounted after first opening to preserve drafts while switching panels. Scoped CSS avoids altering other routes.
**Tech Stack:** React, Next.js, CSS, Playwright.

## Constraints
- No backend changes, real record mutations, commit, or automatic review submission.
- Queue counts count tasks, not distinct companies. Do not classify price-zone entries as buy recommendations.
- Preserve all five categories; remove five-row truncation. Add search, category filter and explicit no-results/reset.
- Distinguish request failures from empty data; retry should preserve current tab, filters and review draft.
- Keep existing `#investment-review` links working, keyboard-accessible tabs, mobile action targets and themes.

## Tasks
- [x] Create `decision/decision.css`, rebuild `decision/page.tsx`: remove metrics tiles, slogan panels and side-by-side review. Header has one record action plus watchlist link; list rows contain task reason, title, detail and destination.
- [x] Add fixtures in `e2e/decision-inbox.spec.ts`: all categories/routes, more than five items, search/filter/reset, tab keyboard, retained draft, partial error/retry and no-match state.
- [x] Update prior decision/contextual-review tests to new explicit review tab and optional guidance disclosure.
- [x] Verify three viewport projects, production build, real before/after screenshots, dark state. No real saves during live checks.

## Verification (2026-09-25)
- Nine new inbox tests pass across desktop, tablet and mobile; six existing decision queue/guidance cases pass across those viewports.
- TypeScript, targeted ESLint and production build passed.
- Real demo read-only screenshots inspected: desktop and mobile pending list, dark desktop; portfolio review inspected separately. Existing data unchanged.
- Initial fixture failures corrected: search inputs use searchbox role; review fixtures need content; retry assertion scopes to the page error rather than Next.js route announcer.

UI test contracts: `decision-queue`, `.decision-task`, tabs selected by `aria-selected`, persistent review DOM with `hidden` panel, filter `aria-pressed`. All controls use text labels rather than decorative icons.
