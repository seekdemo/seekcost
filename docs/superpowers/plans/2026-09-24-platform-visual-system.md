# Platform visual system Implementation Plan

> Execute inline, sequentially. The executing-plans skill is unavailable; preserve existing work and do not commit.

**Goal:** Apply the approved restrained cockpit visual language to all platform surfaces.
**Architecture:** Extend the existing visual-system stylesheet with shared tokens and explicit component selectors. Migrate legacy navigation and standalone headings to shared primitives; keep data, chart colors and workflows unchanged.
**Tech Stack:** Next.js, React, CSS, Playwright.

## Constraints
- Preserve user themes, responsive layouts, accessibility and all existing data.
- No backend changes, live record writes, or commits.
- Do not restyle chart internals, user-authored article typography or selected risk indicators indiscriminately.

## Tasks
- [ ] Add readonly browser regression in `frontend/e2e/platform-visual-system.spec.ts`: shared button radius 7px, card radius 10px, visible route headings, no overflow, no page errors at desktop/tablet/mobile. Public pages always run; authenticated route audit uses an explicit test token.
- [ ] Extend `frontend/src/app/visual-system.css`: shared radius/shadow tokens, global UI primitives (including portaled dialogs), focus rings, status notices, navigation, auth, public information pages and research chrome. Mobile text-entry controls use 16px; preserve input types and compact desktop density.
- [ ] Update `frontend/src/components/Navbar.tsx` and legacy portfolio header to shared semantic style hooks. Research guide uses shared radius/type tokens in its CSS module.
- [ ] Run browser checks, TypeScript and production build. Capture and inspect light/dark desktop/mobile representative screens; document exact coverage and limitations here.

Implementation patterns: `.ui-button { border-radius: var(--control-radius); }`, `.ui-surface { border-radius: var(--panel-radius); }`, `[role="dialog"][aria-modal="true"] { box-shadow: var(--dialog-shadow); }`. Stateful colors remain component-owned.

## Implementation / verification

All four tasks implemented. Added `docs/VISUAL_SYSTEM.md` for future page consistency. Also corrected user-selected research cover contrast using relative luminance; stored colors and content are unchanged.

- Production build passed after final application edits; TypeScript, targeted ESLint and whitespace checks passed.
- 24 fixture browser regressions passed across three sizes: cockpit, guided research (editing/conflicts/mode changes), public content safety, admin draft/preview/confirmed publishing. No real publishing took place.
- Public routes: login, registration, About and guide. Authenticated readonly routes: portfolio, assets, finance, trade, profile, notifications, alerts, IBKR import, research library/topics/guide, earnings and admin access gate. Tests wait for network idle before layout assertions/screenshots.
- Live light/dark screenshots at 1440px and 390px: portfolio, research, profile and About, no page errors or horizontal overflow. Inspected loaded research, About and dark mobile portfolio; corrected cover contrast and cramped filter labels from that inspection.
- Admin editor is verified with mocked APIs, ordinary demo access gate is verified live. Dynamic record details are not comprehensively live-audited in this pass. No data migrations, trading logic edits or commits.
- Initial cover fixture leaked an unmocked authentication request; added fallback API interception, then the targeted cover check passed at all three sizes.
- Final clean platform suite: 9/9 passed (3 viewport projects), bringing the targeted browser regression total to 33 passing checks.
