# Watchlist Decision Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn `/watchlist` from a quote-heavy static list into a calm, logic-first decision funnel with fast stage movement, contextual editing, and responsive keyboard and pointer workflows.

**Architecture:** Keep `WatchStock.stage` and the existing PATCH endpoint as the source of truth. Consolidate list interaction state inside `FunnelView`, add a lightweight decision drawer at the page boundary, and extend the existing quick-capture modal into a scoped command palette. The stable `/watchlist/[id]` company research page remains the complete-detail destination.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, existing SeekCost API client, Playwright.

## Global Constraints

- Do not add a market-data provider or any new runtime dependency.
- Daily price movement is hidden in the radar and research stages and strongly colored only in the strike stage.
- The row's primary narrative is `thesis`, then `entryReason`, then `inspiration`; never synthesize an investment thesis.
- Drag and drop is an enhancement for desktop; every stage action must remain available through keyboard and drawer controls.
- The quick drawer edits decision context only and always exposes the stable full-detail route.
- Do not fabricate stage history. Use created time, updated time, current stage, and existing linked research as the available decision record.
- English remains the default locale; every new user-facing string has English and Simplified Chinese copy.
- Desktop, tablet, and mobile must not introduce horizontal page overflow.

---

### Task 1: Lock the decision-funnel behavior with Playwright

**Files:**
- Create: `frontend/e2e/watchlist-decision-workflow.spec.ts`
- Modify: `frontend/e2e/rich-text-fields.spec.ts`

**Interfaces:**
- Consumes: existing `/api/v1/watchlist/stocks`, `/api/v1/notes`, and `/api/v1/watchlist/memos` request shapes.
- Produces: regression coverage for noise isolation, row logic priority, drawer access, stage keyboard shortcuts, `/` focus, and full-detail navigation.

- [ ] **Step 1: Add a three-stage API fixture**

```ts
const stocks = [
  stock({ id: 1, symbol: "RADR", stage: "radar", thesis: "Track durable demand", price_change_pct: 8.2 }),
  stock({ id: 2, symbol: "RSCH", stage: "conviction", thesis: "Validate margin recovery", strike_price: 80 }),
  stock({ id: 3, symbol: "HIT", stage: "strike", thesis: "Execute only inside range", current_price: 79, strike_price: 80, price_change_pct: -2.1 }),
];
```

- [ ] **Step 2: Write failing interaction assertions**

```ts
await page.goto("/watchlist");
await expect(page.getByText("Track durable demand", { exact: true })).toBeVisible();
await expect(page.getByText("+8.20%", { exact: false })).toHaveCount(0);
await page.keyboard.press("/");
await expect(page.getByRole("searchbox", { name: "Search watchlist" })).toBeFocused();
await page.keyboard.press("Escape");
await page.keyboard.press("j");
await page.keyboard.press("2");
await expect.poll(() => patchedStage).toBe("conviction");
```

- [ ] **Step 3: Run the new test and confirm the behavior is absent**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts --project=desktop`

Expected: FAIL because rows still navigate immediately, radar movement is visible, and `/`, J/K, and 1/2/3 are not implemented.

- [ ] **Step 4: Update the old navigation assertion**

Replace the expectation that one row click immediately navigates with: row click opens `Quick decision`; selecting `Open full company research` navigates to `/watchlist/87`.

- [ ] **Step 5: Keep this task uncommitted until the complete feature passes**

Do not include unrelated dirty research-detail files in any future commit.

### Task 2: Make the list logic-first and stage-aware

**Files:**
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`

**Interfaces:**
- Consumes: `WatchStock.stage`, `thesis`, `entryReason`, `inspiration`, `priceChange`, `priceChangePct`, and price anchors.
- Produces: `decisionThesis(stock)`, stage-aware `QuoteCell`, and stage-aware `PriceSpaceCell`.

- [ ] **Step 1: Add a deterministic narrative selector**

```ts
function decisionThesis(stock: WatchStock) {
  return stripRichText(stock.thesis || stock.entryReason || stock.inspiration).trim();
}
```

- [ ] **Step 2: Put the thesis beneath the company identity**

Render the selected narrative before milestone fallback and rename the column to `Company / core thesis` / `公司 / 核心逻辑`.

- [ ] **Step 3: Isolate short-term quote noise by stage**

```ts
const showDailyMove = stock.stage === "strike";
```

Radar and research rows render the current price neutrally without red/green movement. Strike rows render current movement and use action color only when a finite movement exists.

- [ ] **Step 4: Restrict change sorting to the strike stage**

Hide the gain/loss sort selector outside `strike`, and reset `sort` to `default` when the stage changes.

- [ ] **Step 5: Make price-space emphasis follow stage**

Radar shows only anchor completeness, research shows a quiet progress ruler, and strike shows the strong execution signal when `distanceToStrike(stock) <= 2`.

- [ ] **Step 6: Run the focused test**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts --grep "isolates price noise"`

Expected: PASS.

### Task 3: Add keyboard navigation and deliberate stage movement

**Files:**
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/watchlist-decision-workflow.spec.ts`

**Interfaces:**
- Consumes: `filtered: WatchStock[]`, `updateStock(id, patch)`, and `onQuickEdit(id)`.
- Produces: `activeId`, `searchInputRef`, row `data-watch-stock-id`, and stage shortcuts.

- [ ] **Step 1: Track one active row separately from checkbox selection**

```ts
const [activeId, setActiveId] = useState<string | null>(null);
const activeIndex = filtered.findIndex((stock) => stock.id === activeId);
```

- [ ] **Step 2: Implement guarded keyboard handling**

Ignore keystrokes from inputs, textareas, selects, contenteditable elements, dialogs, and modified key combinations. `/` focuses search; J/K moves the active row; 1/2/3 patches radar/research/strike; E or Space opens quick decision.

- [ ] **Step 3: Keep the active row in view**

```ts
document.querySelector(`[data-watch-stock-id="${CSS.escape(next.id)}"]`)
  ?.scrollIntoView({ block: "nearest" });
```

- [ ] **Step 4: Add drag target feedback**

Track `dragOverStage`, apply a restrained ring and scale to the destination stage, and clear it on drop, drag leave, and drag end.

- [ ] **Step 5: Test keyboard and pointer equivalence**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts --grep "keyboard|drag"`

Expected: PASS; stage PATCH requests use the same existing endpoint.

### Task 4: Add the contextual quick-decision drawer

**Files:**
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/watchlist-decision-workflow.spec.ts`

**Interfaces:**
- Consumes: selected `WatchStock`, linked `WatchNote[]`, `updateStock`, `router.push`, and localized stage labels.
- Produces: `QuickDecisionDrawer` with `onClose`, `onSave`, `onMoveStage`, and `onOpenDetail` callbacks.

- [ ] **Step 1: Open the drawer from one row click**

Store `decisionStockId` in `WatchlistContent`; row click and E/Space set this ID instead of navigating.

- [ ] **Step 2: Build an accessible responsive drawer**

Use `role="dialog"`, `aria-modal="true"`, Escape handling, outside-click close, a desktop right panel capped at 460px, and a mobile full-width panel.

- [ ] **Step 3: Limit editing to decision-critical fields**

Render current/fair/strike/target prices, core thesis, invalidation condition, and three stage buttons. Save one PATCH containing only changed decision fields.

- [ ] **Step 4: Render honest validation and record summaries**

Good company is complete only when company research or thesis exists; good price requires fair or strike price; catalyst requires a pending milestone, growth driver, or inspiration. Show current stage, created/updated timestamps, and linked research titles without claiming unavailable transition history.

- [ ] **Step 5: Preserve complete research navigation**

`Open full company research` routes to `/watchlist/{id}`. Direct URLs continue rendering the existing five-part company dossier.

- [ ] **Step 6: Run drawer tests at all viewports**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts`

Expected: desktop, tablet, and mobile PASS with no page overflow.

### Task 5: Compact the header and extend Cmd K into a scoped command palette

**Files:**
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/watchlist-decision-workflow.spec.ts`

**Interfaces:**
- Consumes: existing `QuickCapture`, `setView`, and funnel external-query state.
- Produces: parsed commands `add <symbol>` and `filter <term>` plus a compact tools menu.

- [ ] **Step 1: Parse explicit command prefixes**

```ts
function parseWatchlistCommand(value: string) {
  const match = value.trim().match(/^(add|filter)\s+(.+)$/i);
  return match ? { type: match[1].toLowerCase(), value: match[2].trim() } : { type: "add", value: value.trim() };
}
```

- [ ] **Step 2: Route filter commands into the funnel**

`filter ai` closes the palette, selects funnel view, and writes `ai` to the funnel search input. `add aaoi` reuses the existing delayed symbol search and creation workflow.

- [ ] **Step 3: Reduce header action sprawl**

Keep market scope, view mode, and quick capture visible. Move import, automatic classification, earnings calendar, and refresh into a click-outside tools menu with one familiar overflow trigger.

- [ ] **Step 4: Verify responsive controls**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts --grep "command palette|responsive"`

Expected: PASS at 1440x1000, 834x1112, and 390x844.

### Task 6: Final verification and visual audit

**Files:**
- Modify only if verification identifies a scoped defect.

**Interfaces:**
- Consumes: all outputs from Tasks 1-5.
- Produces: a verified watchlist decision workflow.

- [ ] **Step 1: Run static checks**

Run: `npm run lint -- --quiet`

Expected: exit 0.

Run: `npx tsc --noEmit`

Expected: exit 0.

- [ ] **Step 2: Run watchlist regression tests**

Run: `npx playwright test e2e/watchlist-decision-workflow.spec.ts e2e/rich-text-fields.spec.ts e2e/market-quotes.spec.ts e2e/watchlist-classification.spec.ts`

Expected: all selected desktop, tablet, and mobile projects PASS.

- [ ] **Step 3: Inspect real screenshots**

Capture `/watchlist` with the radar list, strike list, quick drawer, and command palette at desktop and mobile widths. Confirm daily movement is absent outside strike, core thesis is readable, controls do not overlap navigation, drawers remain operable, and `document.documentElement.scrollWidth <= window.innerWidth`.

- [ ] **Step 4: Review the final diff**

Run: `git diff --check` and inspect only the plan, watchlist implementation, watchlist translations, and focused tests. Preserve all unrelated research-detail worktree changes.
