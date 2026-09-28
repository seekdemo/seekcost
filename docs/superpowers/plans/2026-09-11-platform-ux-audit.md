# Platform Responsive UX Implementation Plan

**Goal:** Inspect the platform at 390, 834 and 1440 px, fix observed usability issues, and retain a repeatable read-only audit.

**Architecture:** Use the real local demo account with Playwright, collecting screenshots and DOM geometry across navigation destinations. Fix shared navigation/layout first, then page-specific issues. Existing business workflows and data remain unchanged.

**Tech Stack:** Next.js 16, React, CSS, Playwright.

## Constraints

- No trade submissions, imports, deletions, strategy scans or autosaved document creation during audit.
- Preserve unrelated working-tree changes. No automatic commits.
- Keep Chinese and English usable; verify tablet as well as desktop and phone.

## Tasks

Completed: all tasks below have been executed. Final scope, fixes, tests, screenshots and limitations are recorded in `docs/qa/2026-09-11-platform-ux.md`. Extra viewport coverage: 320 and 1280 px; public login/register and light-theme/dialog states also captured. Code was executed inline; no subagents or automatic commits.

- [ ] Create `frontend/e2e/platform-ux-audit.spec.ts`. Login using environment credentials; visit workbench, portfolio, assets, dashboard, trade, finance, decision, watchlist, stock detail, quant, earnings, research, topics, tools, profile, import, about, guide. Save screenshots and inspect widths, visible controls, error states and headings.
- [ ] Run `npx playwright test e2e/platform-ux-audit.spec.ts` with the existing desktop/tablet/mobile projects. Review screenshots, not just geometry assertions.
- [ ] Fix observed shared problems in `frontend/src/components/Navbar.tsx` / `frontend/src/app/globals.css`; add checks for selected navigation, minimum touch targets and opaque sticky navigation.
- [ ] Fix page-specific problems identified by screenshots; retain normal action semantics and data handling.
- [ ] Rerun the audit and interactions (search/filter, navigation, dialog opening/cancel, keyboard focus); run TypeScript, touched-file ESLint and `git diff --check`.
- [ ] Record evidence, remaining limitations and screenshot paths in this document.
