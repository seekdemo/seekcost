# Contextual Reviews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the standalone review product area and place concise, private reviews beside the asset transactions and investment decisions they evaluate.

**Architecture:** Reuse private research notes with `kind="review"` instead of introducing another review table. Asset reviews carry an `asset` research link; portfolio reviews have no entity link. A shared client component owns the structured three-question composer, recent-review list, and note creation workflow.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, FastAPI, SQLAlchemy, Playwright, pytest.

## Global Constraints

- SeekCost remains an independent private investment management and decision-support system.
- Reviews must be short, structured, and useful; they must not become another document editor.
- Existing private research and transaction data must remain intact.
- The interface must work on desktop, tablet, and mobile.
- English remains the default locale; new user-facing copy must support all configured locales with an English fallback.

---

### Task 1: Remove the standalone review product area

**Files:**
- Delete: `frontend/src/app/review/page.tsx`
- Delete: `frontend/src/app/board/page.tsx`
- Delete: `frontend/src/components/BoardCharts.tsx`
- Modify: `frontend/src/lib/navigation.ts`
- Modify: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/types.ts`
- Delete: `backend/app/api/v1/board.py`
- Delete: `backend/app/schemas/board.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/api/v1/auth.py`

**Interfaces:**
- Consumes: Existing product-area navigation and the unused `/api/v1/board` aggregation endpoint.
- Produces: Three fixed product areas: `workbench`, `portfolio`, and `decision`; `/review`, `/board`, and `/api/v1/board` no longer exist.

- [x] **Step 1: Update navigation tests to expect three primary entries and no review route**

```ts
await expect(navigation.getByRole("link")).toHaveCount(3);
const response = await page.goto("/review");
expect(response?.status()).toBe(404);
```

- [x] **Step 2: Run the focused responsive test and confirm the old expectations fail**

Run: `cd frontend && npx playwright test e2e/responsive-surfaces.spec.ts --project=mobile`

Expected: FAIL because navigation still has four items and `/board` is still in the route list.

- [x] **Step 3: Remove review from `NAV_ITEMS`, `SECTION_NAV`, path matching, mobile icons, and legacy preference allowlists**

```ts
export type ProductArea = "workbench" | "portfolio" | "decision";
```

- [x] **Step 4: Delete the two route files, chart component, board API client/types, FastAPI router, and response schema**

```py
api_router.include_router(dashboard_router)
api_router.include_router(trade_plans_router)
```

- [x] **Step 5: Search for dead board references**

Run: `rg -n "getBoard|BoardResponse|/board|/review" frontend/src backend/app`

Expected: No live route, API, or navigation references remain.

### Task 2: Add the shared concise review workflow

**Files:**
- Create: `frontend/src/components/QuickReviewPanel.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Modify: `frontend/src/app/assets/[id]/page.tsx`
- Modify: `frontend/src/app/decision/page.tsx`
- Modify: `frontend/src/app/profile/page.tsx`
- Test: `frontend/e2e/contextual-reviews.spec.ts`

**Interfaces:**
- Consumes: `api.listNotes({ kind: "review" })`, `api.createNote(ResearchWrite)`, `ResearchNote.links`, and the current locale.
- Produces: `QuickReviewPanel({ scope, asset?, className? })`, where `scope` is `"asset" | "portfolio"` and `asset` is `{ id, symbol, name }` for asset reviews.

- [x] **Step 1: Write a browser test for the two contextual entry points**

```ts
await page.goto("/assets/1");
await page.getByRole("button", { name: "交易记录" }).click();
await expect(page.getByRole("heading", { name: "个股交易复盘" })).toBeVisible();
await page.goto("/decision");
await expect(page.getByRole("link", { name: "投资复盘" })).toBeVisible();
```

- [x] **Step 2: Implement the three-question composer**

```ts
const content = answers
  .map((answer, index) => `## ${prompts[index]}\n\n${answer.trim()}`)
  .join("\n\n");
await api.createNote({
  title,
  content,
  format: "markdown",
  kind: "review",
  status: "active",
  links: asset ? [{ entity_type: "asset", entity_id: asset.id }] : [],
});
```

- [x] **Step 3: Filter recent reviews by ownership context**

```ts
const belongsToScope = (note: ResearchNote) =>
  asset
    ? note.links.some((link) => link.entity_type === "asset" && link.entity_id === asset.id)
    : note.links.length === 0;
```

- [x] **Step 4: Add loading, success, error, empty, character-count, keyboard, and disabled-submit states**

The form requires all three answers, caps each answer at 280/280/180 characters, announces save errors, and clears only after the API confirms creation.

- [x] **Step 5: Add English, Simplified Chinese, Traditional Chinese, Japanese, Spanish, and French labels**

Use `quickReview.*` keys for titles, prompts, hints, buttons, saved status, failures, and recent-review labels.

- [x] **Step 6: Place the asset review beside transaction records**

```tsx
<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
  <div>{transactionContent}</div>
  <QuickReviewPanel scope="asset" asset={{ id: data.id, symbol: data.symbol, name: data.name }} />
</div>
```

- [x] **Step 7: Place investment review in the decision right rail**

```tsx
<QuickReviewPanel scope="portfolio" className="xl:sticky xl:top-32" />
```

- [x] **Step 8: Add the “Investment review” action beside “Record decision”**

```tsx
<a href="#investment-review" className="ui-button">{t("quickReview.portfolioAction")}</a>
```

- [x] **Step 9: Update profile product-boundary copy from four workspaces to three**

The profile explains that review now lives inside assets and decisions instead of presenting it as a separate destination.

### Task 3: Verify behavior and cleanup

**Files:**
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`
- Test: `frontend/e2e/contextual-reviews.spec.ts`
- Test: `backend/tests/test_research_privacy.py`

**Interfaces:**
- Consumes: Completed Tasks 1-2.
- Produces: Type-safe, lint-clean, buildable contextual review workflow.

- [x] **Step 1: Run backend privacy and API tests**

Run: `cd backend && pytest tests/test_research_privacy.py -q`

Expected: PASS; review notes remain isolated by current user and validate asset links.

- [x] **Step 2: Run frontend static checks**

Run: `cd frontend && npm run lint && npx tsc --noEmit && npm run build`

Expected: PASS with no board imports or type errors.

- [x] **Step 3: Run focused browser tests**

Run: `cd frontend && npx playwright test e2e/contextual-reviews.spec.ts e2e/responsive-surfaces.spec.ts`

Expected: PASS on configured desktop and mobile projects.

- [x] **Step 4: Check formatting and live routes**

Run: `git diff --check`

Expected: No whitespace errors; `/assets/1` and `/decision` render successfully, while `/review` is absent.
