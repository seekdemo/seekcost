# About and How-to Guide Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two public, responsive product-information pages that explain what SeekCost is and guide a new user through its complete investment decision loop.

**Architecture:** Keep the four-item product navigation unchanged and expose `/about` and `/guide` through a small shared product-information navigation plus a new help section on the profile page. Store the copy in a focused i18n module that plugs into the existing translator, with complete English and Simplified Chinese text and a safe English fallback for the other supported locales. Both routes remain public; all calls to action into authenticated product areas continue to rely on those areas' existing authentication behavior.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind/global CSS, existing SeekCost i18n utilities, Playwright.

---

## Global constraints

- The new routes are `/about` and `/guide` and must be readable while signed out.
- Do not add a fifth item to the desktop product tabs or mobile bottom navigation.
- Match the existing `PageShell`, surface, typography, dark mode, and responsive conventions.
- At 390px wide, content must not overflow horizontally and interactive targets must remain comfortably tappable.
- State clearly that market data can be delayed or unavailable, intraday observations are provisional, and quantitative signals are evidence rather than investment advice.
- Do not claim a license, data guarantee, brokerage execution capability, or regulatory status the repository does not establish.
- Make no backend, schema, or database changes.
- Preserve all unrelated dirty-worktree changes.

## Task 1: Product-information foundation and About page

**Files:**
- Create: `frontend/src/lib/i18nProductInfo.ts`
- Modify: `frontend/src/lib/i18n.ts`
- Create: `frontend/src/components/ProductInfoNav.tsx`
- Create: `frontend/src/app/about/page.tsx`
- Create: `frontend/src/app/about/AboutContent.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/e2e/product-info.spec.ts`

- [ ] Add an initial Playwright scenario that opens `/about` while signed out and asserts the product position, decision-loop stages, privacy/data boundaries, link to `/guide`, and absence of horizontal overflow on a mobile viewport.
- [ ] Implement `i18nProductInfo.ts` with typed key lookup, complete English and Simplified Chinese messages, and English fallback for `zh-TW`, `ja`, `es`, and `fr` so no raw translation key is displayed.
- [ ] Connect product-information lookup to the existing `translate()` fallback chain without changing existing message precedence.
- [ ] Build a compact shared `ProductInfoNav` for switching between About and Guide and entering the app; include an accessible current-page state and mobile wrapping behavior.
- [ ] Add an About server route with metadata and a client content component covering: product positioning, the catalog-to-review investment loop, core capabilities, privacy-by-design principles, market-data/quantitative-signal boundaries, current product version, and clear calls to the Guide and app.
- [ ] Add only the focused global styles needed for the loop, capability cards, shared information navigation, and responsive layout; reuse existing design tokens wherever possible.
- [ ] Run the focused Playwright scenario and `npm run lint`/TypeScript checks for the touched frontend files.
- [ ] Self-review the task diff for accessibility, unsupported claims, translation fallbacks, and accidental changes to the primary navigation.

## Task 2: Practical How-to guide and discoverability

**Files:**
- Modify: `frontend/src/lib/i18nProductInfo.ts`
- Create: `frontend/src/app/guide/page.tsx`
- Create: `frontend/src/app/guide/GuideContent.tsx`
- Modify: `frontend/src/app/profile/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/e2e/product-info.spec.ts`

- [ ] Extend the Playwright coverage for `/guide`: signed-out access, visible quick-start structure, working anchors and app links, Simplified Chinese locale rendering, and a 390px no-overflow check.
- [ ] Implement a guide route with metadata and a responsive client content component. Include a compact table of contents and seven outcome-oriented steps: create an account and preferences; build/import the investment catalog; create candidates; capture thesis/evidence/invalidation anchors; read K-line, quantitative, and provisional intraday evidence; plan/record execution; review and iterate.
- [ ] For every step, show where it happens in SeekCost, what the user should enter or verify, and a direct action link. Keep authenticated destinations honest by labeling them as in-app actions rather than implying the guide itself performs them.
- [ ] Add short page-orientation sections for Workbench, Investments, Decisions, and Tools, followed by a data-and-safety section and a first-session checklist.
- [ ] Add a `Product & Help` section to the authenticated profile page with descriptive links to `/guide` and `/about`; preserve existing profile forms and the four-item global navigation.
- [ ] Complete the English and Simplified Chinese copy for all guide/profile keys and verify the English fallback for the remaining supported locales.
- [ ] Run the focused Playwright suite, frontend lint, TypeScript validation, and production build.
- [ ] Self-review the final diff for navigation integrity, responsive behavior, keyboard/screen-reader semantics, consistent language, and truthful product/data claims.

## Task 3: Final integration verification

**Files:**
- Verify: all files from Tasks 1–2

- [ ] Run the complete relevant frontend verification set and record exact results: `npm run lint`, the repository's TypeScript check, `npm run build`, and `product-info.spec.ts`.
- [ ] Open `/about` and `/guide` at desktop and mobile widths to visually inspect light/dark-compatible surfaces, active navigation, wrapping, anchor offsets, and calls to action.
- [ ] Confirm signed-out visitors can read both pages, while links into authenticated product areas preserve the existing login flow.
- [ ] Inspect `git diff` to ensure there are no backend changes, no fifth primary/mobile navigation item, and no unrelated formatting churn.
- [ ] Perform a final holistic review against the user's intent: About answers “what is SeekCost and what are its boundaries”; Guide enables a first-time user to complete the decision loop without guessing where to go next.
