# Research Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/research/[id]` as a responsive, document-first research experience with progressive decision context, contextual comments, and a focused editor while preserving every existing Research capability.

**Architecture:** Keep the current Research API, `ResearchPage` data orchestration, and ordered autosave controller. Extract focused presentational shells into `frontend/src/app/research/[id]/`, then make `NoteDetail` in `frontend/src/app/notes/page.tsx` compose them; this reduces the large page file without moving unrelated library logic. Use one reading renderer for normal reading and editor preview, and express all responsive behavior through semantic component state plus CSS breakpoints.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4 plus `globals.css`, React Markdown, Playwright 1.62.

## Global Constraints

- Do not change Research backend permissions, API contracts, or database models.
- Do not add public publishing, author pages, follows, engagement ranking, recommendations, or external platform integrations.
- Do not add an AI generation service; only improve the existing AI-content paste workflow.
- Keep `/research/[id]` as the stable detail URL and preserve Research library return context.
- Keep English as the default locale and provide every new user-facing string in English and Chinese.
- Render a cover only when a real cover exists; never generate a gradient fallback or reserve empty cover space.
- Use a `760px` reading width and an `840px` editing width on desktop.
- At `≥1280px`, use a left outline and contextual right comment thread; at narrower widths use overlay panels or bottom drawers without shrinking the article below its readable width.
- Use an annotation color independent of the product accent and maintain accessible text contrast in light and dark themes.
- Reuse the existing ordered autosave and retry behavior; a failed final save must keep the editor open.
- Add no frontend dependencies.
- The pre-existing worktree state is preserved in baseline commit `3ff5cca`; every implementation task must stage only its exact file list and create its own reviewable commit.

---

## File Map

### New files

- `frontend/src/app/research/[id]/ResearchDocumentBar.tsx` — sticky reading/editing command bar and compact-title behavior.
- `frontend/src/app/research/[id]/ResearchDetailView.tsx` — slot-based reading layout that keeps `NoteDetail` focused on state and callbacks.
- `frontend/src/app/research/[id]/ResearchHeader.tsx` — editorial title, timestamps, progressive context, and optional real cover.
- `frontend/src/app/research/[id]/ResearchDecisionContext.tsx` — progressive research summary and expanded investment metadata.
- `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx` — accessible desktop side panel and tablet/mobile drawer primitive.
- `frontend/src/app/research/[id]/ResearchEditorShell.tsx` — focused editor layout and properties-panel placement.
- `frontend/src/app/research/[id]/ResearchPropertiesPanel.tsx` — labeled properties content and metadata footer inside the responsive panel.
- `frontend/src/app/research/[id]/ResearchAnnotationLayer.tsx` — measured and grouped paragraph-edge comment anchors.
- `frontend/src/app/research/[id]/ResearchCommentThread.tsx` — active quote thread and all-comments/context tabs.
- `frontend/e2e/helpers/research.ts` — reusable Research API fixtures, long-form content, comments, cover, and controllable save failures.

### Modified files

- `frontend/src/app/notes/page.tsx` — compose the new detail components, preserve data actions, and simplify reading/editing branches.
- `frontend/src/app/research/[id]/ResearchArticleShell.tsx` — reading progress, sticky document grid, and compact-title observation.
- `frontend/src/app/research/[id]/ResearchOutline.tsx` — quiet active-section treatment and offset-safe navigation.
- `frontend/src/app/research/[id]/ResearchCommentRail.tsx` — contextual anchor/thread presentation.
- `frontend/src/app/research/[id]/ResearchCommentCard.tsx` — active-thread semantics and compact replies/reactions.
- `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx` — reuse the responsive panel behavior and restore focus.
- `frontend/src/components/MarkdownEditor.tsx` — focused Markdown/preview controls and wide-screen split preview.
- `frontend/src/components/MarkdownToolbar.tsx` — compact, accessible formatting controls.
- `frontend/src/app/globals.css` — replace the existing Research detail visual system and responsive breakpoints.
- `frontend/src/lib/i18nResearch.ts` — English and Chinese copy for the new command bar, decision context, panels, and editor.
- `frontend/e2e/research-document-experience.spec.ts` — reading, metadata, outline, comment, responsive, and cover scenarios.
- `frontend/e2e/research-autosave-editing.spec.ts` — focused editor, properties, preview, AI paste, save failure, and completion scenarios.

---

### Task 1: Document shell and command bar

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchDocumentBar.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchArticleShell.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Create: `frontend/e2e/helpers/research.ts`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**
- Consumes: existing `ResearchSaveState`, `onBack`, `onEdit`, `onDone`, star, delete, and comment callbacks from `NoteDetail`.
- Produces: `ResearchDocumentBar`, with reading and editing modes; `ResearchArticleShell` exposing compact-title state through a render prop; shared `mockResearchDetail` and `mockEditableResearch` Playwright fixtures used by later tasks.

- [ ] **Step 1: Create the shared Research Playwright fixture**

Create `frontend/e2e/helpers/research.ts` with a complete private note fixture and route helpers:

```ts
import type { Page } from "@playwright/test";

export const longMarkdown = Array.from({ length: 24 }, (_, index) =>
  `## Section ${index + 1}\n\nEvidence and reasoning for this section.`
).join("\n\n");
export const sectionedMarkdown = "# Summary\n\nText\n\n## Business\n\nText\n\n## Valuation\n\nText";
export const wideTableMarkdown = "| Metric | 2024 | 2025 | 2026 |\n|---|---:|---:|---:|\n| Revenue | 1 | 2 | 3 |";
export const veryLongTitle = "A deliberately long research title that must wrap without hiding actions on smaller screens";
export const coverDataUrl = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='1200' height='525'%3E%3Crect width='1200' height='525' fill='%232f5f62'/%3E%3C/svg%3E";
export const anchoredComments = [
  { id: 11, note_id: 1, user_id: 1, content: "Recheck after earnings", quote_text: "durable demand", quote_prefix: "", quote_suffix: " matters", start_offset: 0, end_offset: 14, parent_id: null, reactions: [], created_at: "2026-08-10T00:00:00Z", author: { id: 1, nickname: "seekdemo" } },
  { id: 12, note_id: 1, user_id: 1, content: "Add current evidence", quote_text: "durable demand", quote_prefix: "", quote_suffix: " matters", start_offset: 0, end_offset: 14, parent_id: null, reactions: [], created_at: "2026-08-10T01:00:00Z", author: { id: 1, nickname: "seekdemo" } },
];

const baseResearch = {
  id: 1, user_id: 1, title: "Durable advantage",
  content: "# Summary\n\ndurable demand matters", format: "markdown",
  visibility: "private", kind: "thesis", status: "active", confidence: 3,
  next_review_at: null, starred: false, cover_image_url: null, cover_color: null,
  allow_comments: true, stock_symbols: [], knowledge_tags: [], tags: [],
  series: null, series_id: null, links: [], comment_count: 0,
  created_at: "2026-08-01T00:00:00Z", updated_at: "2026-08-10T00:00:00Z",
};

export async function mockResearchDetail(page: Page, overrides: Record<string, unknown> = {}) {
  const { comments = [], ...noteOverrides } = overrides;
  const note = { ...baseResearch, ...noteOverrides, comment_count: Array.isArray(comments) ? comments.length : 0 };
  await page.route("**/api/v1/watchlist/stocks", route => route.fulfill({ json: [{ id: 115, symbol: "NVDA", name: "NVIDIA", stage: "strike" }] }));
  await page.route("**/api/v1/notes**", route => route.fulfill({ json: [note] }));
  await page.route("**/api/v1/notes/1", route => route.fulfill({ json: note }));
  await page.route("**/api/v1/notes/1/comments", route => route.fulfill({ json: comments }));
  await page.route("**/api/v1/notes/series", route => route.fulfill({ json: [] }));
  await page.route("**/api/v1/notes/favorites", route => route.fulfill({ json: { note_ids: [], series: [] } }));
  await page.addInitScript(() => {
    localStorage.setItem("zb_token", "e2e-token");
    localStorage.setItem("seekcost:locale", "en");
  });
}

export async function mockEditableResearch(page: Page, options: Record<string, unknown> = {}) {
  const { failNextPatch = false, ...noteOptions } = options;
  let failPatch = failNextPatch === true;
  let note = { ...baseResearch, ...noteOptions };
  await mockResearchDetail(page, note);
  await page.route("**/api/v1/notes/1", async route => {
    if (route.request().method() === "PATCH") {
      if (failPatch) return route.fulfill({ status: 500, json: { detail: "save failed" } });
      note = { ...note, ...route.request().postDataJSON(), updated_at: new Date().toISOString() };
    }
    await route.fulfill({ json: note });
  });
  return { allowPatches: () => { failPatch = false; } };
}
```

- [ ] **Step 2: Add a failing reading-toolbar test**

Append a Playwright test that opens `/research/1`, verifies stable navigation and actions, then scrolls the title out of view:

```ts
import { anchoredComments, longMarkdown, mockResearchDetail } from "./helpers/research";

test("research document bar preserves navigation and reveals the compact title", async ({ page }) => {
  await mockResearchDetail(page, { title: "Durable advantage", content: longMarkdown, comments: anchoredComments });
  await page.goto("/research/1");
  const bar = page.getByRole("navigation", { name: "Research document" });
  await expect(bar.getByRole("button", { name: "Back to research library" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Comments (2)" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "Star research" })).toBeVisible();
  await expect(bar.getByRole("button", { name: "More actions" })).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 900));
  await expect(bar.getByText("Durable advantage", { exact: true })).toBeVisible();
});
```

- [ ] **Step 3: Run the targeted test and verify failure**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "document bar"
```

Expected: FAIL because the `Research document` navigation and more-actions control do not exist.

- [ ] **Step 4: Implement the command bar**

Create the component with this exact public interface:

```tsx
export interface ResearchDocumentBarProps {
  mode: "reading" | "editing";
  title: string;
  titleVisible: boolean;
  commentCount: number;
  starred: boolean;
  saveState?: ResearchSaveState;
  labels: {
    navigation: string; back: string; comments: string;
    star: string; unstar: string; more: string;
    edit: string; done: string; preview: string; properties: string;
  };
  onBack: () => void;
  onComments: () => void;
  onToggleStar: () => void;
  onEdit: () => void;
  onDone: () => void;
  onRetrySave: () => void;
  onTogglePreview?: () => void;
  onToggleProperties?: () => void;
  moreMenu?: ReactNode;
}
```

Use `aria-label={labels.navigation}`. Show the compact title only when `titleVisible === false`. Close the more menu with `Escape` or outside click. The reading menu contains Modify created time and Delete research; Delete opens the existing confirmation flow and cannot execute from the first click. In editing mode render save state, Preview, Properties, and Done; hide reading-only actions.

- [ ] **Step 5: Make the article shell observe title visibility**

Change `ResearchArticleShell` to accept `titleId` and a function child:

```tsx
interface ResearchArticleShellProps {
  titleId: string;
  progressLabel: string;
  className?: string;
  children: (state: { titleVisible: boolean; progress: number }) => ReactNode;
}
```

Use `IntersectionObserver` with `rootMargin: "-72px 0px 0px 0px"` for the title and retain the current scroll-based progress calculation. Update `NoteDetail` to render `ResearchDocumentBar` from the shell state.

- [ ] **Step 6: Replace toolbar styles and add translations**

Add `.research-document-bar`, `.research-document-bar__inner`, `.research-document-bar__compact-title`, `.research-document-bar__actions`, and `.research-document-menu`. Use a 56px desktop height, 52px mobile height, subtle backdrop blur, visible focus rings, and 44px targets. Add exact English and Chinese strings for every label in the interface.

- [ ] **Step 7: Rerun the test and commit**

Run the targeted test and expect PASS, then stage only the task files:

```bash
git add frontend/src/app/research/\[id\]/ResearchDocumentBar.tsx frontend/src/app/research/\[id\]/ResearchArticleShell.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/helpers/research.ts frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: rebuild research document shell"
```

---

### Task 2: Progressive research header and editorial cover

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchHeader.tsx`
- Create: `frontend/src/app/research/[id]/ResearchDecisionContext.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**
- Consumes: localized labels and the normalized note, linked stocks, topic link, tags, timestamps, and star callbacks.
- Produces: `ResearchDecisionContext` with summary items, an expandable detail region, and an overdue tone.

- [ ] **Step 1: Add failing tests for collapsed and expanded context**

```ts
test("decision context is concise by default and exposes complete metadata", async ({ page }) => {
  await mockResearchDetail(page, {
    kind: "company", status: "active", confidence: 4,
    next_review_at: "2026-08-01T00:00:00Z",
    series: "AI infrastructure", series_id: 7,
    tags: ["moat", "valuation"], stock_symbols: ["NVDA"],
  });
  await page.goto("/research/1");
  const context = page.getByRole("region", { name: "Decision context" });
  await expect(context.getByText("Active")).toBeVisible();
  await expect(context.getByText("4 / 5")).toBeVisible();
  await expect(context.getByText("Review overdue")).toBeVisible();
  await context.getByRole("button", { name: "Show decision context" }).click();
  await expect(page.getByRole("link", { name: "AI infrastructure" })).toBeVisible();
  await expect(page.getByRole("link", { name: "NVDA" })).toBeVisible();
});

test("real cover follows decision context and no cover leaves no placeholder", async ({ page }) => {
  await mockResearchDetail(page, { cover_image_url: null });
  await page.goto("/research/1");
  await expect(page.locator("[data-research-cover]")).toHaveCount(0);
  await mockResearchDetail(page, { cover_image_url: coverDataUrl });
  await page.reload();
  await expect(page.locator("[data-research-cover]")).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "decision context|real cover"
```

Expected: FAIL because the current page renders three signal cards and places the cover before the title.

- [ ] **Step 3: Implement `ResearchDecisionContext`**

```tsx
export interface ResearchDecisionItem {
  id: "status" | "confidence" | "review";
  label: string;
  value: string;
  tone?: "default" | "due";
}

export interface ResearchDecisionContextProps {
  label: string;
  showLabel: string;
  hideLabel: string;
  items: ResearchDecisionItem[];
  children: ReactNode;
}
```

Render a `<section aria-label={label}>`, a button with `aria-expanded`, a three-item summary, and a detail region that respects `prefers-reduced-motion`.

- [ ] **Step 4: Implement and compose `ResearchHeader`**

Give `ResearchHeader` slot props for eyebrow, metadata, context details, and cover; use this fixed internal order:

```tsx
<header className="research-document-header">
  <div className="research-document-header__eyebrow">{kindAndLinkedStock}</div>
  <h1 id="research-document-title">{title}</h1>
  <ResearchMetaBar>{createdUpdatedReadingTime}</ResearchMetaBar>
  <ResearchDecisionContext items={decisionItems}>{connections}</ResearchDecisionContext>
  {coverImage ? <figure data-research-cover>{coverImageElement}</figure> : null}
</header>
```

Remove the three signal cards, private-space badge, cover shade, and cover caption. Keep topic hyperlinks, topic star, and stock hyperlinks inside the expanded region.

- [ ] **Step 5: Implement editorial styling and labels**

Use a `760px` header width, serif title, muted timestamp row, low-contrast decision strip, and a `16 / 7` cover ratio capped at `420px`. On mobile, preserve the image aspect ratio. Add English/Chinese labels for Decision context, Show/Hide decision context, Review overdue, Unassessed, Created, Updated, and Reading time.

- [ ] **Step 6: Rerun tests and commit**

```bash
git add frontend/src/app/research/\[id\]/ResearchHeader.tsx frontend/src/app/research/\[id\]/ResearchDecisionContext.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: add progressive research context"
```

---

### Task 3: Document grid, typography, and responsive outline

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchDetailView.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchArticleShell.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**
- Consumes: `ResearchOutlineItem[]` produced by `outlineFromMarkdown` and `outlineFromRichHtml`.
- Produces: `ResearchDetailView` and `.research-document-grid` with outline, article, annotation-anchor, and thread columns.

- [ ] **Step 1: Add failing desktop and tablet outline tests**

```ts
test("desktop outline tracks sections without wrapping the article in a card", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { content: sectionedMarkdown });
  await page.goto("/research/1");
  await expect(page.getByRole("navigation", { name: "Outline" })).toBeVisible();
  await expect(page.locator(".research-detail__reading-sheet")).toHaveCount(0);
  await page.getByRole("button", { name: "Valuation" }).click();
  await expect(page.locator("#research-heading-2")).toBeInViewport();
});

test("tablet opens outline without narrowing the article", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1000 });
  await mockResearchDetail(page, { content: sectionedMarkdown });
  await page.goto("/research/1");
  await expect(page.getByRole("navigation", { name: "Outline" })).toBeHidden();
  await page.getByRole("button", { name: "Open outline" }).click();
  await expect(page.getByRole("dialog", { name: "Outline" })).toBeVisible();
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "outline tracks|tablet opens outline"
```

Expected: FAIL because the old reading sheet still wraps the article.

- [ ] **Step 3: Build `ResearchDetailView` and the document grid**

Create a slot-based component so `NoteDetail` supplies stateful content without retaining layout markup:

```tsx
export interface ResearchDetailViewProps {
  documentBar: ReactNode;
  header: ReactNode;
  outline?: ReactNode;
  articleBody: ReactNode;
  annotationAnchors?: ReactNode;
  activeThread?: ReactNode;
  overlays?: ReactNode;
  footer?: ReactNode;
}
```

Inside it, render the bar and header followed by `.research-document-grid` with named outline, article, anchors, and thread regions. Remove the old reading-sheet wrapper.

At `≥1280px`, use `minmax(180px, 220px) minmax(0, 760px) 40px minmax(0, 320px)`. Collapse the thread column when closed. Below `1280px`, hide the fixed outline and open it through a responsive panel.

- [ ] **Step 4: Make outline navigation offset-safe**

Update outline buttons to use an 88px top offset and reduced-motion-aware scroll. Track the current heading at a 112px threshold and set `aria-current="location"` on the active button.

- [ ] **Step 5: Replace reading-sheet typography**

Remove the thick border, large radius, and shadow from `.research-detail__reading-sheet`. Apply `.research-article-prose` to Markdown and rich HTML with consistent headings, paragraphs, lists, quotes, tables, code, links, images, and captions. Wrap tables in horizontal scrolling on narrow screens.

- [ ] **Step 6: Rerun tests and commit**

```bash
git add frontend/src/app/research/\[id\]/ResearchDetailView.tsx frontend/src/app/research/\[id\]/ResearchArticleShell.tsx frontend/src/app/research/\[id\]/ResearchOutline.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: rebuild research reading layout"
```

---

### Task 4: Contextual annotation anchors and comment threads

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`
- Create: `frontend/src/app/research/[id]/ResearchAnnotationLayer.tsx`
- Create: `frontend/src/app/research/[id]/ResearchCommentThread.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentRail.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentCard.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**
- Consumes: existing `NoteComment`, active annotation ID, comment submit/reaction callbacks, and `AnnotationView` preference.
- Produces: `ResearchResponsivePanel`, `ResearchAnnotationLayer`, and `ResearchCommentThread`; the comment rail selects a thread without duplicating comment state.

- [ ] **Step 1: Add failing contextual-comment tests**

```ts
test("annotation anchor opens the matching thread and keeps the quote highlighted", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockResearchDetail(page, { comments: anchoredComments });
  await page.goto("/research/1");
  const mark = page.locator("mark[data-comment-id='11']");
  await page.getByRole("button", { name: "2 comments on selected text" }).click();
  const thread = page.getByRole("complementary", { name: "Comment thread" });
  await expect(thread.getByText("Recheck after earnings")).toBeVisible();
  await expect(mark).toHaveClass(/is-active/);
});

test("mobile comment drawer restores focus after closing", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await mockResearchDetail(page, { comments: anchoredComments });
  await page.goto("/research/1");
  const trigger = page.getByRole("button", { name: "Comments (2)" });
  await trigger.click();
  await expect(page.getByRole("dialog", { name: "Comments and review" })).toBeVisible();
  await page.getByRole("button", { name: "Close comments" }).click();
  await expect(trigger).toBeFocused();
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "annotation anchor|restores focus"
```

Expected: FAIL because paragraph-aligned anchors and the new thread landmark do not exist.

- [ ] **Step 3: Implement the responsive panel primitive**

```tsx
export interface ResearchResponsivePanelProps {
  open: boolean;
  title: string;
  closeLabel: string;
  variant: "thread" | "drawer" | "sheet";
  triggerRef?: RefObject<HTMLElement | null>;
  onClose: () => void;
  children: ReactNode;
}
```

Lock background scroll only for modal variants, close on outside click and `Escape`, focus the close button on open, and restore the trigger focus on close.

- [ ] **Step 4: Implement paragraph-aligned anchors in `ResearchAnnotationLayer`**

Retain current quote relocation. Pass mark rectangles from `AnnotatedNotePreview` to `ResearchAnnotationLayer`, group positions within 24px, and render one localized count button per group. Recalculate through `ResizeObserver` and scroll/resize listeners. Keep the pending highlight mounted until submit or cancel.

- [ ] **Step 5: Implement the comment thread**

```tsx
export interface ResearchCommentThreadProps {
  comments: ResearchRailComment[];
  activeId: string | null;
  mode: "context" | "all";
  labels: { thread: string; all: string; context: string; empty: string };
  onModeChange: (mode: "context" | "all") => void;
  onActivate: (commentId: string) => void;
  renderComposer: (parentId?: string) => ReactNode;
}
```

Render the quote summary before comments, reuse `ResearchCommentCard`, preserve side/bottom preference, and make quote clicks return to the active mark.

- [ ] **Step 6: Apply independent annotation colors and translations**

Use a muted straw palette in light mode and amber-brown in dark mode, both independent of `--accent`. Add English/Chinese labels for Comment thread, Context, All comments, comments on selected text, and Close comments.

- [ ] **Step 7: Rerun tests and commit**

```bash
git add frontend/src/app/research/\[id\]/ResearchResponsivePanel.tsx frontend/src/app/research/\[id\]/ResearchAnnotationLayer.tsx frontend/src/app/research/\[id\]/ResearchCommentThread.tsx frontend/src/app/research/\[id\]/ResearchCommentRail.tsx frontend/src/app/research/\[id\]/ResearchCommentCard.tsx frontend/src/app/research/\[id\]/ResearchCommentDrawer.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: add contextual research comments"
```

---

### Task 5: Focused editor and research properties panel

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchEditorShell.tsx`
- Create: `frontend/src/app/research/[id]/ResearchPropertiesPanel.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**
- Consumes: `NoteEditor`, `NoteManagementFields`, `ResearchSaveStatus`, current note state, `onUpdate`, `onDone`, and `onRetrySave`.
- Produces: `ResearchEditorShell` with an `840px` canvas and `ResearchPropertiesPanel` hosted by the responsive panel.

- [ ] **Step 1: Add failing focused-editor tests**

```ts
test("editing uses a focused document shell and on-demand properties", async ({ page }) => {
  await mockEditableResearch(page);
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Research title" })).toBeVisible();
  await expect(page.getByText("Research type")).toBeHidden();
  await page.getByRole("button", { name: "Properties" }).click();
  await expect(page.getByRole("dialog", { name: "Research properties" })).toBeVisible();
  await expect(page.getByText("Research type")).toBeVisible();
});

test("done waits for final save and leaves failed edits open", async ({ page }) => {
  const save = await mockEditableResearch(page, { failNextPatch: true });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("textbox", { name: "Research title" }).fill("Revised thesis");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  save.allowPatches();
  await page.getByRole("button", { name: "Retry save" }).click();
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByRole("region", { name: "Research editor" })).toBeHidden();
});
```

- [ ] **Step 2: Run the tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --grep "focused document shell|done waits"
```

Expected: FAIL because metadata is inline above the editor and there is no Research editor landmark or properties dialog.

- [ ] **Step 3: Implement `ResearchEditorShell`**

```tsx
export interface ResearchEditorShellProps {
  title: ReactNode;
  metadata: ReactNode;
  editor: ReactNode;
  properties: ReactNode;
  propertiesOpen: boolean;
  propertiesTitle: string;
  closePropertiesLabel: string;
  onCloseProperties: () => void;
}
```

Render `<section aria-label="Research editor">`, an `840px` centered canvas, inline document metadata below the title, and `ResearchResponsivePanel` for properties. Do not duplicate save controls inside the canvas.

- [ ] **Step 4: Implement `ResearchPropertiesPanel` and move management fields**

Create `ResearchPropertiesPanel` with `title`, `description`, `children`, and read-only updated timestamp props. Render the editable title, `NoteEditor`, and `NoteManagementFields` through the shell. Put cover choice, type, status, confidence, review date, topic, tags, linked stocks, created time, read-only updated time, and star in the properties panel. Route every change through existing `onUpdate` autosave.

- [ ] **Step 5: Protect unsaved navigation**

When `saveState` is `dirty`, `saving`, or `failed`, intercept back and Done. Flush `dirty` or `saving` changes; for `failed`, remain in the editor and focus Retry save. Add `beforeunload` only while changes are dirty, saving, or failed. Do not add local draft persistence.

- [ ] **Step 6: Style desktop/mobile editor and add translations**

Use an `840px` borderless canvas. Below `768px`, use full width, hide normal bottom navigation while editing, preserve safe-area padding, and render properties as a bottom sheet. Add English/Chinese labels for Research editor, Research title, Research properties, Close properties, and All changes saved.

- [ ] **Step 7: Rerun tests and commit**

```bash
git add frontend/src/app/research/\[id\]/ResearchEditorShell.tsx frontend/src/app/research/\[id\]/ResearchPropertiesPanel.tsx frontend/src/app/research/\[id\]/ResearchResponsivePanel.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-autosave-editing.spec.ts
git commit -m "feat: add focused research editor"
```

---

### Task 6: Visual/Markdown editing, preview, and AI paste polish

**Files:**
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/components/MarkdownEditor.tsx`
- Modify: `frontend/src/components/MarkdownToolbar.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**
- Consumes: existing `NoteEditor`, `RichTextEditor`, `MarkdownEditor`, format converters, and `onUpdate`.
- Produces: one format switch, reading-style preview, wide-screen split preview, and persistent paste undo.

- [ ] **Step 1: Add failing preview and paste tests**

```ts
test("markdown preview uses article typography and split mode only on wide screens", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await mockEditableResearch(page, { format: "markdown" });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  await page.getByRole("button", { name: "Preview" }).click();
  await expect(page.getByRole("region", { name: "Research preview" })).toBeVisible();
  await page.getByRole("button", { name: "Split preview" }).click();
  await expect(page.locator("[data-editor-layout='split']")).toBeVisible();
  await page.setViewportSize({ width: 900, height: 1000 });
  await expect(page.getByRole("button", { name: "Split preview" })).toBeHidden();
});

test("AI rich text paste keeps structure and can be undone", async ({ page }) => {
  await mockEditableResearch(page, { format: "rich" });
  await page.goto("/research/1");
  await page.getByRole("button", { name: "Edit research" }).click();
  const editor = page.getByRole("textbox", { name: "Research body" });
  await editor.focus();
  await editor.evaluate((node) => {
    const transfer = new DataTransfer();
    transfer.setData("text/html", "<h2 style='color:red'>AI summary</h2><script>bad()</script><ul><li>Moat</li></ul>");
    node.dispatchEvent(new ClipboardEvent("paste", { clipboardData: transfer, bubbles: true }));
  });
  await expect(editor.locator("h2")).toHaveText("AI summary");
  await expect(editor.locator("script")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Undo cleaned paste" })).toBeVisible();
});
```

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --grep "markdown preview|AI rich text paste"
```

Expected: FAIL because the command bar does not yet own preview mode and split preview is absent.

- [ ] **Step 3: Consolidate format and preview controls**

Keep `NoteEditor` responsible for `visual | markdown` and the command bar responsible for `editing | preview`. Pass `previewMode: "off" | "single" | "split"` from `NoteDetail`. Render split mode as:

```tsx
<div className="research-editor-layout" data-editor-layout="split">
  <section aria-label={labels.markdownEditor}>{markdownTextarea}</section>
  <section aria-label={labels.researchPreview} className="research-article-prose">{preview}</section>
</div>
```

Do not render Split preview below `1280px`, so it is absent from the focus order.

- [ ] **Step 4: Reuse article typography for preview**

Apply `.research-article-prose` to `MarkdownPreview` and rich preview. Preserve heading IDs so preview and reading mode use identical section semantics.

- [ ] **Step 5: Refine visual editor controls**

Keep the selection bubble, slash menu, `$stock` and `@tag` suggestions, image sizing/alignment, Markdown gestures, and shortcuts. Consolidate duplicate actions into a sticky compact toolbar, add `aria-pressed` to stateful buttons, and keep image errors next to the image control.

- [ ] **Step 6: Make cleaned paste reversible**

Retain the pre-paste HTML in `pasteUndo` until the next content-changing action. Render a status notice with Undo cleaned paste and Dismiss. Undo restores the prior HTML, commits through `onUpdate`, and returns focus to the editor.

- [ ] **Step 7: Add translations, rerun tests, and commit**

Add English/Chinese labels for Single preview, Split preview, Research preview, Cleaned pasted content, Undo cleaned paste, and Dismiss.

```bash
git add frontend/src/app/notes/page.tsx frontend/src/components/MarkdownEditor.tsx frontend/src/components/MarkdownToolbar.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-autosave-editing.spec.ts
git commit -m "feat: refine research editing workflow"
```

---

### Task 7: Responsive behavior, accessibility, and failure states

**Files:**
- Modify: `frontend/src/app/research/[id]/ResearchDocumentBar.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchResponsivePanel.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Modify: `frontend/src/app/notes/page.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-document-experience.spec.ts`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**
- Consumes: all components produced by Tasks 1–6.
- Produces: final four-breakpoint behavior, localized empty/error states, safe-area support, and keyboard-complete overlays.

- [ ] **Step 1: Add a four-viewport regression matrix**

```ts
for (const viewport of [
  { name: "wide desktop", width: 1440, height: 900 },
  { name: "compact desktop", width: 1100, height: 800 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "phone", width: 390, height: 844 },
]) {
  test(`${viewport.name} keeps research actions and content accessible`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockResearchDetail(page, { title: veryLongTitle, content: wideTableMarkdown });
    await page.goto("/research/1");
    await expect(page.getByRole("heading", { name: veryLongTitle })).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit research" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(overflow).toBe(true);
  });
}
```

Add focused cases for Escape closing only the topmost overlay, reduced motion, missing research, image failure, empty outline, long labels, and Chinese locale.

- [ ] **Step 2: Run tests and verify failure**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts e2e/research-autosave-editing.spec.ts --grep "keeps research actions|topmost overlay|Chinese locale"
```

Expected: at least one new case FAILS until responsive and accessibility polish is complete.

- [ ] **Step 3: Finalize exact breakpoints**

```css
@media (min-width: 1280px) {
  .research-document-grid {
    grid-template-columns: minmax(180px, 220px) minmax(0, 760px) 40px minmax(0, 320px);
  }
  .research-document-grid__outline,
  .research-document-grid__anchors { display: block; }
}
@media (min-width: 1024px) and (max-width: 1279px) {
  .research-document-grid { grid-template-columns: minmax(0, 760px); justify-content: center; }
  .research-document-grid__outline,
  .research-document-grid__anchors,
  .research-document-grid__thread { display: none; }
}
@media (min-width: 768px) and (max-width: 1023px) {
  .research-document-grid { display: block; width: min(100% - 48px, 760px); margin-inline: auto; }
  .research-responsive-panel[data-variant="drawer"] { width: min(420px, 90vw); }
}
@media (max-width: 767px) {
  .research-document-grid { display: block; width: 100%; padding-inline: 18px; }
  .research-document-bar { min-height: 52px; padding-top: env(safe-area-inset-top); }
  .research-responsive-panel[data-variant="sheet"] { max-height: min(82dvh, 720px); padding-bottom: env(safe-area-inset-bottom); }
}
```

Use `100dvh`, `env(safe-area-inset-*)`, 44px targets, `overflow-wrap:anywhere`, and horizontal table scrolling.

- [ ] **Step 4: Complete keyboard and screen-reader semantics**

Add visible focus, `aria-expanded`, `aria-current`, `aria-pressed`, and `aria-live` save state. Use `role="dialog"` only for modal panels. `Escape` closes the innermost overlay first; closing restores trigger focus.

- [ ] **Step 5: Complete loading/error states**

Use a document-shaped skeleton. For not found/forbidden, show a localized message and Back to research library. Broken images keep figure dimensions and show retry. Hide outline/comment rails when empty.

- [ ] **Step 6: Rerun tests and commit**

```bash
git add frontend/src/app/research/\[id\]/ResearchDocumentBar.tsx frontend/src/app/research/\[id\]/ResearchResponsivePanel.tsx frontend/src/app/research/\[id\]/ResearchOutline.tsx frontend/src/app/notes/page.tsx frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-document-experience.spec.ts frontend/e2e/research-autosave-editing.spec.ts
git commit -m "feat: finish responsive research experience"
```

---

### Task 8: Full Research regression and production verification

**Files:**
- Modify: only the specific Task 1–7 file that produces a verification failure; do not touch files outside the File Map
- Test: `frontend/e2e/research-document-experience.spec.ts`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**
- Consumes: completed Research detail redesign.
- Produces: verified lint, type safety, production build, and end-to-end behavior.

- [ ] **Step 1: Run Research Playwright tests**

```bash
cd frontend && npx playwright test e2e/research-document-experience.spec.ts e2e/research-autosave-editing.spec.ts
```

Expected: all tests PASS.

- [ ] **Step 2: Run lint and type checking**

```bash
cd frontend && npm run lint
cd frontend && npx tsc --noEmit
```

Expected: both commands exit with code 0 and no new warnings in modified files.

- [ ] **Step 3: Run the production build**

```bash
cd frontend && npm run build
```

Expected: the Next.js build completes and `/research/[id]` has no type or rendering errors.

- [ ] **Step 4: Inspect desktop and mobile screenshots**

Capture `1440×900`, `820×1180`, and `390×844`. Verify no clipped title, no horizontal page overflow, a `760px` reading column, contextual comments only where enough width exists, and drawers/dock on phone.

- [ ] **Step 5: Run dirty-worktree safety checks**

```bash
git status --short
git diff --check
git diff --name-only HEAD
```

Expected: no whitespace errors; intended Research files and pre-existing user changes remain distinguishable.

- [ ] **Step 6: Commit verification fixes only when needed**

If verification required changes, stage only their exact paths and commit with `fix: complete research detail verification`. If no changes were required, do not create an empty commit.
