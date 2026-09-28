# Investment Overview Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/portfolio` as a compact, responsive investment overview with a 65:35 information hierarchy, transparent currency conversion, zero-position filtering, and position-weight cues.

**Architecture:** Keep `GET /dashboard` and `GET /assets` as the only data sources. Convert native market values to CNY for aggregation, then convert CNY into the selected display currency at render time; keep capability spend separate from asset net worth. Implement the experience inside the existing portfolio route and extend the established feature-message catalog without adding dependencies or backend state.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, existing i18n and currency helpers, Playwright.

## Global Constraints

- Preserve the Pine visual system and existing theme tokens.
- Do not add charting dependencies or new backend endpoints.
- Keep brokerage cash distinct from regional equity classifications.
- Treat capability investments as spend, not marketable net worth.
- Make desktop, tablet, and mobile layouts usable without horizontal overflow.
- Do not commit during this execution because the shared worktree already contains unrelated user changes.

---

### Task 1: Define the responsive overview contract

**Files:**
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**
- Consumes: authenticated `/portfolio` route and existing locale setup.
- Produces: stable `data-testid` contracts for the overview layout, currency control, zero-position control, and asset panels.

- [ ] **Step 1: Add a failing portfolio interaction test**

```ts
test("investment overview exposes compact controls and responsive priority", async ({ page }) => {
  await page.goto("/portfolio");
  await expect(page.getByTestId("investment-overview-grid")).toBeVisible();
  await expect(page.getByTestId("portfolio-currency-switcher")).toBeVisible();
  await expect(page.getByTestId("portfolio-zero-toggle")).toBeVisible();
  await expect(page.getByTestId("market-investments-panel")).toBeVisible();
  await expect(page.getByTestId("supporting-investments-column")).toBeVisible();
});
```

- [ ] **Step 2: Run the test and verify the old page lacks the new contract**

Run: `npx playwright test e2e/responsive-surfaces.spec.ts --grep "investment overview"`

Expected: FAIL because the new test IDs do not exist.

### Task 2: Rebuild the portfolio surface

**Files:**
- Modify: `frontend/src/app/portfolio/page.tsx`

**Interfaces:**
- Consumes: `Dashboard.exchange_rates`, `Dashboard.default_currency`, `Asset`, `convertToCNY`, `convertFromCNY`, and `currencySymbol`.
- Produces: `DisplayCurrency = "CNY" | "USD"`; `AssetSort = "value" | "name"`; compact market rows with normalized CNY weights.

- [ ] **Step 1: Add display preferences and normalized calculations**

```ts
type DisplayCurrency = "CNY" | "USD";
type AssetSort = "value" | "name";

const assetValueCny = (asset: Asset, rates: Record<string, number>) =>
  convertToCNY(Math.max(asset.current_price, 0) * Math.max(asset.quantity, 0), asset.market, rates);
```

Initialize currency from `seek_dashboard_display_currency`, fall back to `Dashboard.default_currency`, and persist changes locally plus `api.updateProfile`. Derive visible market assets from the zero-position toggle and sort them by normalized value or symbol.

- [ ] **Step 2: Replace the page header and KPI block**

Use one compact header row for title, `CNY/USD`, investment catalog, and add-investment actions. Render four tightly spaced metrics; the net-worth metric includes a secondary equivalent in the other currency, and market P&L includes a percentage against holding cost when available.

- [ ] **Step 3: Implement the 65:35 responsive grid**

```tsx
<section
  data-testid="investment-overview-grid"
  className="grid gap-4 xl:grid-cols-[minmax(0,1.85fr)_minmax(300px,1fr)]"
>
  <MarketInvestmentsPanel />
  <div data-testid="supporting-investments-column" className="grid content-start gap-4">
    <CompactDomain zone="base" />
    <CompactDomain zone="invest" />
  </div>
</section>
```

Market rows show symbol, company, category, quantity, cost, display-currency value, and a four-pixel portfolio-weight bar. Zero positions remain available but are muted; the default toggle hides them.

- [ ] **Step 4: Compress brokerage accounting without losing scope**

Keep IBKR deposits, holding cost, unrealized P&L, realized P&L, and brokerage cash in one compact full-width ledger strip below the primary grid. Remove explanatory boundary cards that repeat information already conveyed by the domain labels.

### Task 3: Localize and verify the rebuilt surface

**Files:**
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**
- Consumes: `t(key, values)` from `I18nProvider`.
- Produces: complete strings for English, Simplified Chinese, Traditional Chinese, Japanese, Spanish, and French.

- [ ] **Step 1: Add exact UI labels in all supported locales**

Add translations for `currency`, `equivalent`, `pnlPercent`, `sort`, `sortValue`, `sortName`, `hideZero`, `showZero`, `quantityAndCost`, `portfolioWeight`, `addBase`, `addCapability`, `emptyBase`, `emptyCapability`, and `trackedKinds`.

- [ ] **Step 2: Run static checks**

Run: `npx eslint src/app/portfolio/page.tsx src/lib/i18nFeatures.ts e2e/responsive-surfaces.spec.ts`

Expected: PASS with no warnings.

Run: `npx next typegen && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Run browser verification when Chromium is available**

Run: `npx playwright test e2e/responsive-surfaces.spec.ts --grep "investment overview|/portfolio"`

Expected: PASS in desktop, tablet, and mobile projects with no horizontal overflow.

- [ ] **Step 4: Verify the live route**

Run: `curl -sS -o /dev/null -w '%{http_code}\n' http://localhost:3000/portfolio`

Expected: `200`.
