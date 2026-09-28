# Company Research AI Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every company research module a focused Ask AI workflow that copies a rigorous company-specific prompt, opens Gemini or Grok, and leaves the matching Markdown editor ready for the returned answer.

**Architecture:** Generate prompts locally from public company identity and classification fields; never include holdings, costs, private plans, or existing private research. A reusable modal owns prompt editing, clipboard fallback, and external links, while `WatchlistDetailView` owns the selected module and editor state. No backend integration, external API key, account binding, or automatic answer ingestion is added.

**Tech Stack:** Next.js 16, React 19, TypeScript, existing i18n and Markdown editor, Playwright.

## Global Constraints

- Gemini URL is `https://gemini.google.com/app`.
- Grok URL is `https://grok.com/`.
- External AI use is explicit and one-way; SeekCost does not read external accounts or conversations.
- Prompts include public company context only and require dated sources, fact/inference separation, counter-evidence, and Markdown output.
- The current dirty worktree is preserved and no commit is created during this execution.

---

### Task 1: Specify the Ask AI workflow

**Files:**
- Modify: `frontend/e2e/rich-text-fields.spec.ts`

**Interfaces:**
- Consumes: the existing mocked `/watchlist/87` research profile.
- Produces: accessibility contracts for `Ask AI about {title}`, the prompt dialog, provider links, and the paste-ready editor.

- [ ] **Step 1: Add a failing browser test**

```ts
test("each company module prepares a sourced AI prompt and paste-ready editor", async ({ page }) => {
  await mockCandidateApi(page, () => {});
  await page.goto("/watchlist/87");
  await page.getByRole("button", { name: "Ask AI about Industry & moat" }).click();

  const dialog = page.getByRole("dialog", { name: "Ask AI · Industry & moat" });
  await expect(dialog.getByRole("textbox", { name: "Research prompt" })).toContainText("MSFT");
  await expect(dialog.getByRole("link", { name: /Gemini/ })).toHaveAttribute("href", "https://gemini.google.com/app");
  await expect(dialog.getByRole("link", { name: /Grok/ })).toHaveAttribute("href", "https://grok.com/");
  await dialog.getByRole("button", { name: "Open editor to paste" }).click();
  await expect(page.getByRole("textbox", { name: "Current judgment" })).toBeFocused();
});
```

- [ ] **Step 2: Run the focused test**

Run: `npx playwright test e2e/rich-text-fields.spec.ts --grep "company module prepares"`

Expected: FAIL because the Ask AI controls do not exist yet.

### Task 2: Generate rigorous section-specific prompts

**Files:**
- Create: `frontend/src/app/watchlist/detail/researchAiPrompts.ts`

**Interfaces:**
- Consumes: `WatchResearchSectionKey`, `WatchlistStock`, and the active locale code.
- Produces: `buildResearchAiPrompt(key: WatchResearchSectionKey, stock: WatchlistStock, locale: Locale): string`.

- [ ] **Step 1: Define shared source and privacy rules**

The generated prompt must identify the company, ticker, sector, industries, and concepts, then require exact data dates, primary-source URLs, fact/calculation/inference labels, explicit unknowns, counter-evidence, and paste-ready Markdown. It must explicitly forbid inventing data and must not contain `planned_capital`, `strike_price`, `target_price`, holdings, cost basis, or existing section content.

- [ ] **Step 2: Define five distinct research tasks**

```ts
const SECTION_REQUIREMENTS: Record<WatchResearchSectionKey, string[]> = {
  company_overview: ["revenue model and segments", "customers and suppliers", "unit economics", "management and capital allocation"],
  industry_moat: ["value chain and market structure", "competitors and shares", "switching costs and durable advantages", "counter-evidence"],
  growth_financials: ["five-year and recent-quarter trends", "growth drivers", "margins, FCF, ROIC, debt and dilution", "leading indicators"],
  risks_invalidation: ["ranked risk register", "observable indicators", "numeric invalidation thresholds", "pre-mortem and strongest bear case"],
  valuation_decision: ["current multiples and history", "peer comparison", "base/bull/bear valuation", "reverse expectations and margin of safety"],
};
```

Return Chinese prompts for Chinese locales and English instructions with an explicit response-language requirement for English, Japanese, Spanish, and French.

### Task 3: Add the prompt dialog and paste handoff

**Files:**
- Create: `frontend/src/app/watchlist/detail/ResearchAiPromptDialog.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchSectionCard.tsx`
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchSectionEditor.tsx`
- Modify: `frontend/src/components/MarkdownEditor.tsx`

**Interfaces:**
- Consumes: generated prompt, translated module title, `onClose`, and `onUsePrompt`.
- Produces: editable prompt text, robust clipboard copying, real provider links, and an auto-focused summary editor.

- [ ] **Step 1: Add Ask AI beside Edit on every module**

Extend `ResearchSectionCard` with `onAskAi: () => void` and render a minimum-40px Ask AI button with `aria-label={t("dossier.askAiSection", { title })}`.

- [ ] **Step 2: Implement the accessible prompt dialog**

Render a modal dialog with an editable prompt textarea, Copy prompt button, Gemini/Grok links using `target="_blank" rel="noreferrer"`, and Open editor to paste. Escape and backdrop click close the dialog. Provider link clicks copy the edited prompt and invoke `onUsePrompt` before the new tab opens.

- [ ] **Step 3: Make the matching editor paste-ready**

Add `autoFocus?: boolean` to `MarkdownEditor`, pass it through `ResearchSectionEditor` as `autoFocusSummary`, and set that flag only for Ask AI handoffs. The existing sanitized Markdown paste handler remains the single ingestion path.

### Task 4: Localize and verify

**Files:**
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/rich-text-fields.spec.ts`

**Interfaces:**
- Consumes: existing `dossier.*` feature message catalogs.
- Produces: complete labels in English, Simplified Chinese, and fallback-safe translations for the other supported locales.

- [ ] **Step 1: Add UI copy**

Add `dossier.askAi`, `dossier.askAiSection`, `dossier.aiDialogTitle`, `dossier.researchPrompt`, `dossier.copyPrompt`, `dossier.promptCopied`, `dossier.openGemini`, `dossier.openGrok`, `dossier.openEditorToPaste`, `dossier.publicContextOnly`, and `dossier.closeAiPrompt`.

- [ ] **Step 2: Run static verification**

Run: `npx eslint src/app/watchlist/detail/ResearchAiPromptDialog.tsx src/app/watchlist/detail/researchAiPrompts.ts src/app/watchlist/detail/ResearchSectionCard.tsx src/app/watchlist/detail/ResearchSectionEditor.tsx src/app/watchlist/detail/WatchlistDetailView.tsx src/components/MarkdownEditor.tsx src/lib/i18nFeatures.ts e2e/rich-text-fields.spec.ts`

Expected: PASS.

Run: `npx next typegen && npx tsc --noEmit`

Expected: PASS.

- [ ] **Step 3: Verify desktop and mobile in a real browser**

Open `/watchlist/87` at 1440x1000 and 390x844, verify the dialog fits the viewport, provider URLs are correct, the page has no horizontal overflow, and Open editor to paste focuses Current judgment.
