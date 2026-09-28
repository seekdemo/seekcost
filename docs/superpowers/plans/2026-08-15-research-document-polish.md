# Research Document Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refine `/research/[id]` into a quiet, professional document surface that matches the supplied document-style brief while preserving SeekCost's existing private investment workflow.

**Architecture:** Keep the current API, note data model, ordered autosave controller, Markdown/rich-text renderers, and annotation behavior. Refine the existing focused components in `frontend/src/app/research/[id]/`, make comments an on-demand responsive drawer instead of a permanently occupied desktop column, and replace the current editorial styling with compact document typography and neutral surfaces.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4, global CSS, Playwright 1.62.

## Global Constraints

- Do not change backend APIs, permissions, database models, or persisted Research content.
- Do not add sharing, version history, PDF export, live market data, financial calendars, or investment widgets without real data support.
- Preserve editing, ordered autosave, save retry, Markdown preview, rich text, cover handling, properties, star, delete, comments, replies, Emoji reactions, annotations, outline, and return context.
- Keep English as the default locale and Simplified Chinese supported.
- Add no frontend dependencies.
- Keep the article readable in dark and light themes; do not force a theme.
- Use a `720px` reading column and an `840px` editing column.
- Use fixed responsive constraints, 44px touch targets, safe-area spacing, and no horizontal viewport overflow.

---

## File Map

- Modify `frontend/src/app/research/[id]/ResearchDocumentBar.tsx`: quieter command bar hierarchy and stable action semantics.
- Modify `frontend/src/app/research/[id]/ResearchHeader.tsx`: group metadata and decision properties into one compact document-properties surface.
- Modify `frontend/src/app/research/[id]/ResearchDecisionContext.tsx`: expose semantic item identifiers and accessible disclosure structure.
- Modify `frontend/src/app/research/[id]/ResearchDetailView.tsx`: simplify the reading grid around outline, article, and annotation anchors.
- Modify `frontend/src/app/research/[id]/ResearchOutline.tsx`: preserve section tracking with calmer document navigation.
- Modify `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`: use a true right drawer on larger screens and a bottom sheet on phones.
- Modify `frontend/src/app/research/[id]/ResearchCommentThread.tsx`: compact thread header and empty state.
- Modify `frontend/src/app/notes/page.tsx`: make comments on-demand and open them from annotation anchors.
- Modify `frontend/src/app/globals.css`: replace Research detail typography, spacing, surfaces, grid, drawer, and responsive rules.
- Modify `frontend/src/lib/i18nResearch.ts`: only if the revised UI introduces user-facing copy.
- Modify `frontend/e2e/research-document-experience.spec.ts`: lock the new drawer and responsive layout behavior.

---

### Task 1: Lock the revised interaction contract

**Files:**
- Modify: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**
- Consumes: existing `mockResearchDetail`, comments, Markdown headings, and viewport fixtures.
- Produces: regression coverage for an on-demand comment drawer, compact metadata, reading width, and non-overlapping mobile controls.

- [x] **Step 1: Change the desktop comment test to expect the thread closed initially**

Assert that `[data-research-region='thread']` has no visible content before activation, click the document Comments button, and then assert a dialog named `Comments & review` is visible.

- [x] **Step 2: Add a properties-surface assertion**

Assert `.research-document-header__properties` contains the created time, updated time, status, confidence, and review point without requiring the details disclosure to open.

- [x] **Step 3: Add responsive geometry assertions**

At `1440x900`, assert the article width is `720px`. At `390x844`, assert the document title is at most `30px`, the page has no horizontal overflow, and the mobile dock does not intersect the first article heading.

- [x] **Step 4: Run the focused tests and confirm the new assertions fail**

Run:

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "comment|properties|desktop outline|viewport"
```

Expected: at least the permanent desktop thread and `760px` article-width assertions fail against the old design.

---

### Task 2: Refine the document structure

**Files:**
- Modify: `frontend/src/app/research/[id]/ResearchHeader.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchDecisionContext.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchDetailView.tsx`
- Modify: `frontend/src/app/notes/page.tsx`

**Interfaces:**
- Consumes: the existing metadata and decision-context slots, `commentDrawerOpen`, annotation callbacks, and responsive drawer.
- Produces: `.research-document-header__properties`, `data-decision-item`, and an article grid without a permanent comment-thread column.

- [x] **Step 1: Group metadata and decision context**

Wrap `ResearchMetaBar` and `ResearchDecisionContext` in `<div className="research-document-header__properties">`. Keep the cover below the properties surface and keep expanded topic/tag/stock details in the existing disclosure.

- [x] **Step 2: Add semantic decision item identifiers**

Render `data-decision-item={item.id}` on every decision summary item. Keep `aria-label`, `aria-expanded`, and native button behavior on the disclosure control.

- [x] **Step 3: Remove the permanent desktop thread**

Stop passing `activeThread` to `ResearchDetailView`. Keep the comment drawer mounted for every viewport and open it from the document command bar.

- [x] **Step 4: Open comments from an annotation anchor**

In every annotation activation callback, set the active annotation, set context mode, and call `setCommentDrawerOpen(true)` before locating the marked text.

- [x] **Step 5: Run TypeScript and the focused tests**

Run:

```bash
cd frontend && npx tsc --noEmit && npx playwright test e2e/research-document-experience.spec.ts --grep "comment|properties"
```

Expected: TypeScript passes; structure tests pass after Task 3 styling lands.

---

### Task 3: Replace the Research detail visual system

**Files:**
- Modify: `frontend/src/app/research/[id]/ResearchDocumentBar.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentThread.tsx`
- Modify: `frontend/src/app/globals.css`

**Interfaces:**
- Consumes: existing class names, responsive panel variants, CSS theme variables, and command callbacks.
- Produces: a `720px` reading column, compact document typography, quiet properties surface, on-demand desktop drawer, phone bottom sheet, and stable mobile action spacing.

- [x] **Step 1: Flatten the command bar**

Use a bottom border, `8px` maximum radius, no floating-card shadow, a compact title, text only for clear commands, and 44px targets. Preserve outside-click and Escape behavior for the More menu.

- [x] **Step 2: Apply document typography**

Use the system sans-serif stack throughout the title and article. Set the document title to `32px/1.35` desktop and `26px/1.35` phone; body to `15px/1.78`; H2 to `20px`, H3 to `17px`; use `letter-spacing: 0` everywhere in this surface.

- [x] **Step 3: Style the properties surface**

Use a neutral low-contrast background, `8px` radius, one subtle border, compact timestamp row, and three stable decision columns. Due review uses a restrained warning tone rather than the product accent.

- [x] **Step 4: Rebuild the reading grid and outline**

At `>=1280px`, use `200px 720px 32px`, centered within the available area. Keep the outline sticky, remove uppercase letter spacing, use a 2px active rule, and avoid decorative cards.

- [x] **Step 5: Rebuild comments as a responsive panel**

At `>=768px`, use a fixed right drawer up to `400px` wide and full viewport height below the application navigation. Below `768px`, use an `82dvh` bottom sheet with safe-area padding. Keep focus trapping, Escape, backdrop click, and trigger focus restoration.

- [x] **Step 6: Prevent mobile overlap**

Reserve bottom space for the mobile action dock, simplify its chrome, keep it above the primary navigation, and verify it does not cover headings or table content.

- [x] **Step 7: Run focused visual-contract tests**

Run:

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts
```

Expected: all Research document experience tests pass.

---

### Task 4: Complete regression and visual verification

**Files:**
- Modify: only files required by failures found in this task.

**Interfaces:**
- Consumes: the completed Research detail implementation.
- Produces: verified production-quality behavior at desktop, tablet, and phone widths.

- [x] **Step 1: Run static checks**

```bash
cd frontend && npm run lint && npx tsc --noEmit && npm run build
```

Expected: all commands exit `0`.

- [x] **Step 2: Run Research regressions**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts e2e/research-autosave-editing.spec.ts
```

Expected: all tests pass.

- [x] **Step 3: Capture responsive screenshots**

Capture `/research/1` at `1440x900`, `820x1180`, and `390x844` with the standard mocked Research fixture. Inspect title wrapping, reading width, drawer geometry, table overflow, dock overlap, light/dark contrast, and annotation visibility.

- [x] **Step 4: Verify repository hygiene**

```bash
git diff --check && git status --short
```

Expected: no whitespace errors and only the intended plan, Research components, CSS, and tests are modified.
