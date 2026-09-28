# Alerts redesign implementation plan

**Goal:** Make alert rules easy to scan, find and edit on desktop and mobile without changing evaluation semantics.

**Architecture:** Keep existing API and form contract. Replace the card wall with a single rule list, search/status filters and a focused inline editor view. Scope styles to alerts only.

**Execution:** Inline in this session; executing-plans skill unavailable. No repository commit or agent delegation requested.

## Files and steps

- [x] `frontend/src/app/alerts/page.tsx`: add `filter: all | enabled | paused | attention` and query state; search name/symbol/company, count rules (not stocks), distinguish paused/inside/unavailable. Keep manual refresh, delete confirmation and save error retention. Use existing `AlertRuleForm` when editing and hide the list temporarily.
- [x] `frontend/src/app/alerts/alerts.css`: scoped neutral list surface, aligned condition/status/actions columns; collapse into stacked rows below 760px; maintain 44px targets and theme variables.
- [x] `frontend/src/app/alerts/AlertRuleForm.tsx`: numbered coverage/condition sections, readable rule summary, sticky save/cancel actions, preserve entered values on failure.
- [x] `frontend/e2e/custom-alerts.spec.ts`: retain CRUD and all-watchlist tests; add fixture-based search/filter tests and screenshots. No real rules created.

## Verification

Run `npx playwright test e2e/custom-alerts.spec.ts` for desktop/tablet/mobile, `npx tsc --noEmit`, and ESLint for changed TSX. Inspect generated list and editor screenshots, including mobile. Live demo inspection is read-only.
