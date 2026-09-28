# Research Reading And AI Notes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the research detail route into a quiet, lightweight reading surface for pasted AI answers and reports, with compact metadata, useful source/ticker affordances, and an on-demand personal notes drawer.

**Architecture:** Keep the existing `/research/[id]` route, comments persistence, annotation anchors, and watchlist API. Add presentation-only metadata and Markdown token components, pass the already-loaded watchlist records into rendering, and allow the existing linked-stock relationship to support an explicit core-thesis update without adding a new storage model.

**Tech Stack:** Next.js App Router, React, TypeScript, Tailwind/global CSS, react-markdown, Playwright.

## Global Constraints

- Preserve the Pine visual language and current light/dark theme variables.
- Do not fabricate live prices, source links, or research-to-stock relationships.
- Recognize explicit `$TICKER` tokens and symbols that match the current user's watchlist; do not treat arbitrary uppercase words as tickers.
- Only enhance timestamps that are already valid Markdown links.
- Reuse comments as personal notes and existing anchored comments as persistent highlights.
- Keep desktop, tablet, and mobile layouts free of horizontal page overflow.

---

### Task 1: Lock The Lightweight Reading Contract

**Files:**
- Modify: `frontend/e2e/research-document-experience.spec.ts`
- Modify: `frontend/e2e/helpers/research.ts`

**Interfaces:**
- Consumes: `mockResearchDetail(page, overrides)` and the `/api/v1/watchlist/stocks` route.
- Produces: assertions for inline metadata, notes drawer, ticker preview, source timestamps, core-thesis updates, outline fading, and responsive overflow.

- [ ] **Step 1: Write failing Playwright coverage**

Add focused tests that expect `data-research-meta`, `data-research-ticker`, `data-research-timestamp`, a document-bar button named `Personal notes (N)`, and a single-stock `PATCH /api/v1/watchlist/stocks/:id` request containing `thesis`.

- [ ] **Step 2: Run the tests and verify the new expectations fail**

Run: `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --project=desktop --grep "lightweight|ticker|timestamp|core thesis|personal notes"`

Expected: FAIL because the new reading affordances are not rendered yet.

- [ ] **Step 3: Keep the test fixtures truthful**

Return a watchlist row with `id`, `symbol`, `name`, `stage`, `current_price`, `strike_price`, `fair_price`, `target_price`, and `thesis`; capture PATCH requests rather than assuming persistence.

- [ ] **Step 4: Re-run the focused suite**

Run the same Playwright command and retain the failures as the implementation baseline.

### Task 2: Flatten The Research Header And Quiet The Outline

**Files:**
- Modify: `frontend/src/app/research/[id]/ResearchHeader.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`

**Interfaces:**
- Consumes: current note kind, dates, status, confidence, review date, tags, topic, and stock links.
- Produces: one `data-research-meta` inline row and an optional compact details disclosure; the outline continues to expose `aria-current="location"`.

- [ ] **Step 1: Replace the decision card with inline metadata**

Render kind, published date, computed reading time, status, confidence, and review state as short inline items directly below the title. Keep tags/topic/linked stocks in a compact secondary row or the existing properties editor.

- [ ] **Step 2: Remove obsolete card composition from the detail page**

Stop mounting the large decision-context block in reading mode while preserving the editable properties workflow.

- [ ] **Step 3: Add restrained sticky-outline behavior**

Keep the outline within the viewport through the end of the document; use lower opacity on pointer-capable desktop layouts and restore full opacity on hover/focus-within.

- [ ] **Step 4: Run header and layout tests**

Run: `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "lightweight|outline|overflow"`

Expected: PASS for desktop, tablet, and mobile projects.

### Task 3: Add Truthful Ticker And Timestamp Rendering

**Files:**
- Create: `frontend/src/components/research/ResearchTickerMention.tsx`
- Modify: `frontend/src/lib/markdown/renderMarkdown.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`

**Interfaces:**
- Consumes: `ResearchTickerSummary[]`, `sourceNoteId`, and sanitized Markdown anchor URLs.
- Produces: `ResearchTickerMention`, `data-research-ticker`, and `data-research-timestamp` while preserving the real `href`.

- [ ] **Step 1: Define the ticker summary type and focused component**

Expose `id`, `symbol`, `name`, `stage`, optional current/strike/fair/target values, and optional thesis. The component shows the token inline and reveals only available values plus a link to the existing watchlist detail.

- [ ] **Step 2: Pass watchlist summaries into Markdown rendering**

Extend `renderMarkdown` and `MarkdownPreview` with an optional ticker map. Resolve explicit `$SYMBOL` tokens against that map; leave unknown tokens as the current watchlist search link.

- [ ] **Step 3: Style linked timestamps without inventing destinations**

When an anchor's plain text matches `[hh:]mm:ss`, render it as a compact timestamp control with `data-research-timestamp` and the already-sanitized URL.

- [ ] **Step 4: Run ticker and timestamp tests**

Run: `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "ticker|timestamp"`

Expected: PASS with mocked values and exact source URLs.

### Task 4: Reframe Comments As On-Demand Personal Notes

**Files:**
- Modify: `frontend/src/app/research/[id]/ResearchDocumentBar.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`

**Interfaces:**
- Consumes: existing comment count, comment drawer state, comment API, selected quote, and a unique linked watchlist stock.
- Produces: an on-demand `Personal notes (N)` drawer and `Use as core thesis` selection action.

- [ ] **Step 1: Rename the reading affordance without changing storage**

Change reader-facing labels from comments/review to personal notes while preserving internal comment types and API routes.

- [ ] **Step 2: Remove visible annotation-mode controls from the article**

Keep anchored marks and selection behavior, but remove the persistent side/bottom mode switch and duplicate in-article rails. Comments remain reachable from the document bar drawer.

- [ ] **Step 3: Add the explicit core-thesis action**

When exactly one research stock is linked, offer `Use as core thesis` beside `Add comment`; PATCH that stock's existing endpoint with `{ thesis: selectedText }`, show success/failure feedback, and never guess when links are absent or ambiguous.

- [ ] **Step 4: Remove the duplicate selection-dialog wrapper**

Keep one modal container with the existing focus trap, Escape behavior, selection context, and comment composer.

- [ ] **Step 5: Run notes and selection tests**

Run: `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "personal notes|core thesis|selection"`

Expected: PASS.

### Task 5: Validate The Complete Reading Experience

**Files:**
- Modify: `frontend/e2e/research-document-experience.spec.ts` only if a verified cross-viewport regression requires a test correction.

**Interfaces:**
- Consumes: all changes from Tasks 1-4.
- Produces: a type-safe, lint-clean, production-buildable research detail experience.

- [ ] **Step 1: Run TypeScript and focused lint**

Run: `cd frontend && npx tsc --noEmit && npx eslint src/app/notes/page.tsx 'src/app/research/[id]/*.tsx' src/components/research/ResearchTickerMention.tsx src/lib/markdown/renderMarkdown.tsx e2e/research-document-experience.spec.ts e2e/helpers/research.ts`

Expected: exit code 0.

- [ ] **Step 2: Run the complete research-detail Playwright file**

Run: `cd frontend && npx playwright test e2e/research-document-experience.spec.ts`

Expected: all configured desktop, tablet, and mobile projects pass.

- [ ] **Step 3: Run the production build**

Run: `cd frontend && npm run build`

Expected: exit code 0 with `/research/[id]` compiled successfully.

- [ ] **Step 4: Inspect desktop and mobile screenshots**

Capture `/research/1` at `1440x900` and `390x844`; verify the title and meta row are readable, no controls overlap, the article remains centered, the outline stays inside the viewport, and the notes drawer does not obscure its close control.
