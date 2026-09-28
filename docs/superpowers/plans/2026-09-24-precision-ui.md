# Precision UI Implementation Plan

> Execute inline sequentially; executing-plans skill unavailable. User authorized implementation, not another approval cycle.

**Goal:** Improve actual visual hierarchy, density and page-to-page consistency beyond shared corner radii.
**Architecture:** Keep one global visual-system stylesheet; add explicit layout hooks for watchlist and document surfaces. Simplify research card markup rather than concealing repeated content with CSS. Preserve chart/data semantics and user-authored content.
**Tech Stack:** Next.js, React, CSS, Playwright.

## Constraints
- Preserve dirty worktree, all live data and user themes. No commit or backend writes.
- Reading layouts and dense financial layouts need different content widths, not identical containers.
- Maintain keyboard focus, touch targets, error/empty/loading and reduced-motion states.

## Tasks
- [ ] Add `frontend/e2e/precision-ui.spec.ts` using existing research fixtures. Assert one visible title per card, no decorative repeated title, controls work, mobile overflow absent and rendered screenshots.
- [ ] Refine `visual-system.css`: 4/8px spacing scale, explicit canvas/surface separation, consistent header baselines, quiet navigation, aligned numeric columns, compact cockpit panels. Do not override chart colors.
- [ ] Refactor research cards in `notes/NotesClient.tsx`: compact cover/status strip, single main title, aligned metadata/footer, bounded excerpt. Keep chosen colors and images intact.
- [ ] Add watchlist/detail layout hooks: shared title sizing, mobile natural page scroll, consistent section gaps. Improve research article visual containment without changing editor or annotations.
- [ ] Run fixture regressions and production build; capture real desktop/mobile screenshots after data loading. Check representative dark state, dialogs, errors/empty fixtures. Document coverage and known limits.

Test pattern: `await expect(card.locator('h2')).toHaveCount(1); await expect(card.locator('.research-card__fallback p')).toHaveCount(0);` and check `scrollWidth <= innerWidth` at all three configured sizes.

## Delivered and verified

All implementation tasks completed. Additional fixes: mobile sticky document title now gets a compact second row, section anchors clear that row, empty-state icon no longer implies success, destructive confirmation uses white text independently of theme, and skeleton cards match the revised card height.

- Final production build and TypeScript passed; targeted ESLint and `git diff --check` passed.
- Final fixture suite: 141 passed, six credential-dependent checks skipped. Reran those six with the local demo account and verified all six passed (K-line keyboard/range/risk checks and alert editor cancellation/inbox, no record saves).
- Final platform route suite: nine passed, covering public pages and 13 authenticated routes across 1440/834/390px. Combined final browser coverage: 156 passing checks.
- Live screenshot audit: home, watchlist, research, AMZN dossier and a research document at 1440/390px; no overflow or page exceptions. Additional dark desktop research and dark mobile home inspected. Images under `/tmp/seekcost-precision-*` and `/tmp/seekcost-detail-final-*`.
- Corrected the previous header alignment test to compare the panel's content edge (border + padding), while retaining the alignment assertion. Initial failures also exposed the missing mobile sticky title, which is now fixed and verified.
- This is a visual/interaction release, not a claim that every possible data shape or custom theme has been exhaustively tested. User data, actual signals and stored custom covers preserved. No commit or backend changes.
