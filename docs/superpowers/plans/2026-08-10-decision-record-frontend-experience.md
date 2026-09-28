# Decision Record Frontend Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade SeekCost's decision-record module into a calm, document-first research experience with polished visual editing, Markdown compatibility, reliable autosave, focused reading, contextual comments, and responsive library/topic navigation.

**Architecture:** Keep the current `content + format` persistence contract and the existing research APIs. `frontend/src/app/notes/page.tsx` remains the route-level data controller while editor, save state, detail context, and library controls move into focused client components under `frontend/src/app/research/_components/`. Existing detail components under `frontend/src/app/research/[id]/` are enhanced rather than replaced, and all presentation continues to use the current theme tokens and i18n system.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4 plus `globals.css`, existing `contentEditable`/Markdown renderer, Playwright 1.62.

## Global Constraints

- Preserve the backend `notes.content` string and `notes.format` values `markdown | rich`; do not add a migration or change a research API contract.
- Do not add an editor framework or another runtime dependency; improve the editor already in the repository.
- Existing Markdown and rich-text research must remain readable and editable without destructive conversion.
- New research defaults to visual editing; existing research opens in the format in which it is stored.
- English remains the default locale and every new visible string must have both English and Simplified Chinese translations.
- Desktop is `>= 1024px`, tablet is `641px–1023px`, and phone is `<= 640px`; primary touch targets are at least `44px`.
- Do not introduce public/community behavior, real-time collaboration, block JSON, BLEX integration, or use port `8000`.
- Preserve all unrelated dirty-worktree changes and stage only files belonging to the task being committed.
- Keep the frontend on `localhost:3000` and the SeekCost backend on `localhost:8001` for manual and Playwright verification.

---

## Planned File Structure

### New files

- `frontend/src/app/research/_components/useResearchAutoSave.ts`: ordered, retryable autosave controller for one active research document.
- `frontend/src/app/research/_components/ResearchSaveStatus.tsx`: accessible save-state indicator and retry action.
- `frontend/src/app/research/_components/ResearchDocumentEditor.tsx`: visual/Markdown mode shell and the extracted rich-text editor.
- `frontend/src/app/research/_components/ResearchContextPanel.tsx`: desktop tabs for outline and inline comments.
- `frontend/src/app/research/_components/ResearchMobileDock.tsx`: phone actions and bottom-drawer selection for outline/comments.
- `frontend/src/app/research/_components/ResearchLibraryToolbar.tsx`: search, scope, sort, view, and mobile filter entry point.
- `frontend/src/app/research/_components/ResearchFilterDrawer.tsx`: phone/tablet filter drawer.
- `frontend/e2e/research-document-experience.spec.ts`: editor, reading, comments, responsive, and library-context coverage.

### Existing files to modify

- `frontend/src/app/notes/page.tsx`: route state, data mapping, active-document orchestration, and integration with extracted components.
- `frontend/src/app/notes/series/page.tsx`: simplified topic list/detail layout and responsive topic editing.
- `frontend/src/app/decision/page.tsx`: action-first decision overview.
- `frontend/src/app/research/[id]/ResearchArticleShell.tsx`: document progress and stable document layout.
- `frontend/src/app/research/[id]/ResearchOutline.tsx`: Markdown and rich-text heading extraction and active-section tracking.
- `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx`: accessible tablet/phone drawer behavior.
- `frontend/src/app/research/[id]/ResearchCommentRail.tsx`: contextual comment list and moved-anchor presentation.
- `frontend/src/app/research/[id]/ResearchCommentCard.tsx`: active, reply-count, and moved-anchor states.
- `frontend/src/components/MarkdownEditor.tsx`: clearer source/preview modes, paste feedback, save status, and shortcuts.
- `frontend/src/components/MarkdownToolbar.tsx`: compact horizontally scrollable toolbar with complete document actions.
- `frontend/src/lib/i18n.ts`: decision-overview copy in the existing locale dictionaries.
- `frontend/src/lib/i18nResearch.ts`: English and Chinese copy for the new UI states.
- `frontend/src/app/globals.css`: decision-record layout, editor, reading, drawer, and responsive styles.
- `frontend/e2e/research-autosave-editing.spec.ts`: autosave ordering, failure, and continued-editing regression coverage.

---

### Task 1: Reliable Ordered Autosave and Editing Lifecycle

**Files:**

- Create: `frontend/src/app/research/_components/useResearchAutoSave.ts`
- Create: `frontend/src/app/research/_components/ResearchSaveStatus.tsx`
- Modify: `frontend/src/app/notes/page.tsx:994-1175,1767-2038`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**

- Consumes: `api.updateNote(id, noteToApi(note, stocks))` and the active `WatchNote` value owned by `NotesContent`.
- Produces:

```ts
export type ResearchSaveState = "idle" | "dirty" | "saving" | "saved" | "failed";

export interface ResearchAutoSaveController<T> {
  state: ResearchSaveState;
  schedule: (value: T) => void;
  flush: (value?: T) => Promise<boolean>;
  retry: () => Promise<boolean>;
  cancel: () => void;
}

export function useResearchAutoSave<T>(options: {
  documentKey: string | null;
  delayMs: number;
  persist: (value: T) => Promise<void>;
  onError: (error: unknown) => void;
}): ResearchAutoSaveController<T>;
```

- `ResearchSaveStatus` consumes `state`, `onRetry`, and localized labels; later editor/detail tasks reuse it.

- [ ] **Step 1: Extend the autosave Playwright test with an out-of-order response and failure case**

Add two tests that use deferred `PATCH /api/v1/notes/1` responses. The newer edit must remain visible even when the older request completes later, and a failed final save must keep the editor open with a retry button.

```ts
test("older saves cannot replace the newest research draft", async ({ page }) => {
  const patches: Array<() => Promise<void>> = [];
  await installResearchRoutes(page, {
    onPatch: async (route) => {
      patches.push(() => route.fulfill({ json: { ...note, ...route.request().postDataJSON() } }));
    },
  });
  await openResearchEditor(page);
  const title = page.getByPlaceholder("Write a clear title");
  await title.fill("First change");
  await expect.poll(() => patches.length).toBe(1);
  await title.fill("Newest change");
  await expect.poll(() => patches.length).toBe(2);
  await patches[1]();
  await patches[0]();
  await expect(title).toHaveValue("Newest change");
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});

test("failed final save keeps research editable and can retry", async ({ page }) => {
  let fail = true;
  await installResearchRoutes(page, {
    onPatch: (route) => fail
      ? route.fulfill({ status: 500, json: { detail: "save failed" } })
      : route.fulfill({ json: { ...note, ...route.request().postDataJSON() } }),
  });
  await openResearchEditor(page);
  await page.getByPlaceholder("Write a clear title").fill("Keep this locally");
  await page.getByRole("button", { name: "Done editing" }).click();
  await expect(page.getByPlaceholder("Write a clear title")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry save" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry save" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();
});
```

Extract `installResearchRoutes` and `openResearchEditor` inside the same spec so the existing test data remains local and deterministic.

- [ ] **Step 2: Run the autosave tests and verify the new cases fail**

Run:

```bash
cd frontend
npx playwright test e2e/research-autosave-editing.spec.ts --project=desktop
```

Expected: the new tests fail because no visible save lifecycle/retry action exists and request completion is not ordered.

- [ ] **Step 3: Implement the ordered autosave hook**

The hook must keep the latest queued value in a ref, increment a request sequence for every persisted snapshot, and ignore completion state from requests older than the latest started request. It must never replace the caller's local document value with a response body.

Core ordering logic:

```ts
const revisionRef = useRef(0);
const latestScheduledRef = useRef(0);

const persistLatest = useCallback(async (snapshot: T, revision: number) => {
  setState("saving");
  try {
    await persist(snapshot);
    if (revision === latestScheduledRef.current) setState("saved");
    return true;
  } catch (error) {
    if (revision === latestScheduledRef.current) {
      setState("failed");
      onError(error);
    }
    return false;
  }
}, [onError, persist]);
```

`schedule(value)` stores the newest snapshot, increments `revisionRef`, copies it into `latestScheduledRef`, sets `dirty`, replaces the active timer, and calls `persistLatest(snapshot, revision)` after `650ms`. `flush(value)` clears the timer and persists the supplied or latest value using the latest revision. `retry()` increments the revision and persists the retained snapshot. `documentKey` changes cancel the timer and reset the state to `idle` without discarding the caller's document state.

- [ ] **Step 4: Integrate save state into `NotesContent` and `NoteDetail`**

Replace `noteSaveTimers` for the active research editor with the hook. `updateNote` still updates `notes` synchronously, then calls `schedule(nextNote)`. Change the completion callback to await `flush(activeNote)` and only clear `editingId` when it returns `true`.

Pass these props into the detail/editor surface:

```ts
saveState: ResearchSaveState;
onRetrySave: () => Promise<boolean>;
onDone: () => Promise<void>;
onSaveNow: () => Promise<boolean>;
```

Render `ResearchSaveStatus` with `aria-live="polite"`. The failed state must contain a button, not only red text. Add English and Chinese strings for `Unsaved`, `Saving…`, `Saved`, `Save failed`, and `Retry save`.

- [ ] **Step 5: Run autosave regression tests**

Run:

```bash
cd frontend
npx playwright test e2e/research-autosave-editing.spec.ts --project=desktop
```

Expected: all autosave cases pass, including continued editing, out-of-order completion, failed final save, and retry.

- [ ] **Step 6: Run TypeScript and lint for the touched files**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/notes/page.tsx src/app/research/_components/useResearchAutoSave.ts src/app/research/_components/ResearchSaveStatus.tsx src/lib/i18nResearch.ts e2e/research-autosave-editing.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 7: Commit the autosave lifecycle**

```bash
git add frontend/src/app/notes/page.tsx frontend/src/app/research/_components/useResearchAutoSave.ts frontend/src/app/research/_components/ResearchSaveStatus.tsx frontend/src/lib/i18nResearch.ts frontend/e2e/research-autosave-editing.spec.ts
git commit -m "fix: make research autosave reliable"
```

---

### Task 2: Visual-First Research Editor and AI Paste Flow

**Files:**

- Create: `frontend/src/app/research/_components/ResearchDocumentEditor.tsx`
- Modify: `frontend/src/app/notes/page.tsx:1800-2665`
- Modify: `frontend/src/components/MarkdownEditor.tsx`
- Modify: `frontend/src/components/MarkdownToolbar.tsx`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**

- Consumes: Task 1 `ResearchSaveState`, save callbacks, existing rich-text sanitizer/converters, and research stock/tag suggestions.
- Produces:

```ts
export interface ResearchEditorStock {
  id: string;
  symbol: string;
  name: string;
}

export interface ResearchDocumentEditorProps {
  format: "markdown" | "rich";
  content: string;
  stocks: ResearchEditorStock[];
  allowedTags: string[];
  saveState: ResearchSaveState;
  onChange: (patch: { format?: "markdown" | "rich"; content?: string }) => void;
  onSave: () => Promise<boolean>;
  onDone: () => Promise<void>;
}
```

- The visual mode maps to backend `format="rich"`; the source mode maps to `format="markdown"`.
- Existing Markdown documents initially show the Markdown source editor. Existing rich documents and all newly created documents initially show the visual editor.

- [ ] **Step 1: Write editor experience tests**

Create `research-document-experience.spec.ts` with deterministic research routes and these assertions:

```ts
test("new research starts in visual editing mode", async ({ page }) => {
  await loginAndOpen(page, "/research/new");
  await expect(page.getByRole("tab", { name: "Visual" })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("textbox", { name: "Research body" })).toHaveAttribute("contenteditable", "true");
});

test("AI HTML paste is cleaned and can be undone", async ({ page, context }) => {
  await openRichResearch(page);
  const body = page.getByRole("textbox", { name: "Research body" });
  await body.focus();
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.evaluate(async () => {
    await navigator.clipboard.write([
      new ClipboardItem({
        "text/html": new Blob(["<h2 style='color:red'>AI thesis</h2><script>alert(1)</script><p><b>Demand</b> improves.</p>"], { type: "text/html" }),
        "text/plain": new Blob(["AI thesis\nDemand improves."], { type: "text/plain" }),
      }),
    ]);
  });
  await page.keyboard.press("ControlOrMeta+V");
  await expect(page.getByText("Pasted content cleaned")).toBeVisible();
  await expect(body.locator("script")).toHaveCount(0);
  await page.getByRole("button", { name: "Undo paste" }).click();
  await expect(body).not.toContainText("AI thesis");
});

test("Markdown source and preview remain available", async ({ page }) => {
  await openMarkdownResearch(page);
  await page.getByRole("tab", { name: "Markdown" }).click();
  await expect(page.getByRole("textbox", { name: "Research body" })).toBeVisible();
  await page.getByRole("tab", { name: "Preview" }).click();
  await expect(page.getByRole("heading", { name: "Initial thesis" })).toBeVisible();
});
```

Use Playwright's `browserName`/platform-safe modifier helper rather than hard-coding only `Meta` in the actual spec.

- [ ] **Step 2: Run the editor tests and verify they fail**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --project=desktop --grep "visual|paste|Markdown"
```

Expected: visual-default and paste-feedback assertions fail against the current editor.

- [ ] **Step 3: Extract the editor surface into `ResearchDocumentEditor`**

Move `NoteEditor` and `RichTextEditor` presentation out of `notes/page.tsx`. Keep data normalization and API work in `NotesContent`. Preserve sanitization, image insertion/resizing, `$stock`, `@tag`, Markdown gestures, slash insertion, and selection toolbar behavior.

Use explicit visual labels while preserving storage values:

```ts
const modes = [
  { id: "rich", label: t("research.visualMode") },
  { id: "markdown", label: t("research.markdownMode") },
] as const;
```

Mode switching converts only after an explicit click. Do not convert while loading or saving. The component must call `onChange({ format: next, content: converted })` once and stay mounted.

- [ ] **Step 4: Make visual editing the new-document default**

In `NewNoteContent`, initialize the draft with:

```ts
format: "rich",
content: "",
```

Keep `apiNoteToWatchNote` unchanged so existing Markdown research continues to open as Markdown.

- [ ] **Step 5: Complete the visual editing controls**

Extend the selection toolbar and `/` menu with exact command groups:

```ts
type RichBlockAction =
  | "h2"
  | "h3"
  | "bullet"
  | "numbered"
  | "quote"
  | "code"
  | "divider"
  | "image"
  | "stock"
  | "tag";

type RichInlineAction = "bold" | "italic" | "strike" | "link";
```

Map `numbered` to `insertOrderedList`, `strike` to `strikeThrough`, `divider` to sanitized `<hr>`, and `code` to `<pre><code><br></code></pre>`. `Command/Ctrl + K` opens a small link field anchored to the current selection; `Enter` applies it and `Escape` cancels without losing the selection.

The persistent toolbar stays one row and horizontally scrolls on narrow screens. The selection toolbar appears only for a non-collapsed selection inside the editor. A `Focus` toggle hides research metadata and secondary navigation while keeping Back, title, save state, mode, and Done visible. `Escape` closes the topmost editor popover; if none is open it exits focus mode and leaves focus in the document.

- [ ] **Step 6: Add AI paste feedback with undo**

Before rich paste, store `editor.innerHTML` and the current sanitized HTML. Insert sanitized HTML or plain text, then show a five-second notice:

```ts
interface PasteNotice {
  previousHtml: string;
  insertedKind: "formatted" | "plain" | "image";
}
```

The notice reads `Pasted content cleaned` / `已整理粘贴内容` and contains `Undo paste` / `撤销粘贴`. Undo restores `previousHtml`, calls the normal commit function, focuses the document, and hides the notice. Do not rewrite or summarize pasted text.

Update Markdown paste so it prefers converted HTML when HTML contains headings/lists/code, otherwise uses plain text. Preserve the textarea selection and show the same feedback/undo behavior through a component-local previous-value snapshot.

- [ ] **Step 7: Connect save state and keyboard completion**

Render `ResearchSaveStatus` in the editor header. `Command/Ctrl + Enter` calls `onDone`; a failed flush leaves the editor mounted. `beforeunload` is active for `dirty`, `saving`, and `failed` states.

- [ ] **Step 8: Run editor tests on all viewports**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "visual|paste|Markdown"
```

Expected: desktop, tablet, and mobile projects pass.

- [ ] **Step 9: Run TypeScript and lint**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/notes/page.tsx src/app/research/_components/ResearchDocumentEditor.tsx src/components/MarkdownEditor.tsx src/components/MarkdownToolbar.tsx src/lib/i18nResearch.ts e2e/research-document-experience.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 10: Commit the editor upgrade**

```bash
git add frontend/src/app/notes/page.tsx frontend/src/app/research/_components/ResearchDocumentEditor.tsx frontend/src/components/MarkdownEditor.tsx frontend/src/components/MarkdownToolbar.tsx frontend/src/lib/i18nResearch.ts frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: upgrade research document editing"
```

---

### Task 3: Focused Reading Layout, Outline, and Responsive Context Panel

**Files:**

- Create: `frontend/src/app/research/_components/ResearchContextPanel.tsx`
- Create: `frontend/src/app/research/_components/ResearchMobileDock.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchArticleShell.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchMetaBar.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx`
- Modify: `frontend/src/app/notes/page.tsx:1767-2000,2660-2688`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Modify: `frontend/src/app/globals.css:763-960`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**

- Consumes: `ResearchOutlineItem[]`, comment rail node, existing `ResearchCommentDrawer`, and the reading/editing state from `NoteDetail`.
- Produces:

```ts
export type ResearchContextTab = "outline" | "comments";

export interface ResearchContextPanelProps {
  activeTab: ResearchContextTab;
  outlineCount: number;
  commentCount: number;
  outline: ReactNode;
  comments: ReactNode;
  onTabChange: (tab: ResearchContextTab) => void;
}

export function outlineFromRichHtml(source: string): ResearchOutlineItem[];
export function attachResearchHeadingIds(root: HTMLElement, items: ResearchOutlineItem[]): void;
```

- [ ] **Step 1: Add reading and outline tests**

Add tests for a Markdown research item, a rich-text research item, and a no-cover research item:

```ts
test("reading mode keeps the title visible and skips a fake cover", async ({ page }) => {
  await openNoCoverResearch(page);
  await expect(page.getByRole("heading", { name: "Initial thesis" })).toBeInViewport();
  await expect(page.getByTestId("research-cover-placeholder")).toHaveCount(0);
});

test("outline navigates Markdown and rich-text headings", async ({ page }) => {
  await openRichResearch(page, "<h2>Business model</h2><p>Body</p><h2>Risks</h2><p>Body</p>");
  await page.getByRole("button", { name: "Risks" }).click();
  await expect(page.locator("#research-heading-1")).toBeInViewport();
});

test("mobile reading actions open outline and comments drawers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await openMarkdownResearch(page);
  await page.getByRole("button", { name: "Open outline" }).click();
  await expect(page.getByRole("dialog", { name: "On this page" })).toBeVisible();
  await page.getByRole("button", { name: "Close outline" }).click();
  await page.getByRole("button", { name: /Open comments/ }).click();
  await expect(page.getByRole("dialog", { name: "Comments & review" })).toBeVisible();
});
```

- [ ] **Step 2: Run reading tests and verify failures**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "reading|outline"
```

Expected: rich-text outline and mobile outline drawer cases fail; no-cover research still renders the decorative fallback cover.

- [ ] **Step 3: Simplify the article header and cover behavior**

In reading mode, render a cover only when `coverImageUrl` or a real body image exists. Remove the large generated fallback cover from detail pages. Keep generated colors on research-library cards only.

Order the reading header as:

```text
kind/status → title → created/updated/read time → state/confidence/review → topic/tags/stocks → body
```

The title begins within the first viewport on phone and tablet. The document body uses a maximum reading width of `760px`; the full reading grid may expand to `1120px` only when the desktop context panel is visible.

- [ ] **Step 4: Support outlines for both document formats**

Keep `outlineFromMarkdown`. Add `outlineFromRichHtml` using `DOMParser` and `h1,h2,h3` order. Sanitize labels with `textContent`, assign stable `research-heading-N` IDs, and use `attachResearchHeadingIds` after rich content renders.

Update `ResearchOutline` to accept an optional `onNavigate` callback so the mobile drawer closes after navigation:

```ts
export interface ResearchOutlineProps {
  items: ResearchOutlineItem[];
  title: string;
  onNavigate?: () => void;
}
```

Use `IntersectionObserver` with a `rootMargin` of `-20% 0px -70% 0px` for active-section tracking and retain the existing scroll fallback only when the observer is unavailable.

- [ ] **Step 5: Build the desktop context panel**

`ResearchContextPanel` is shown only at `min-width: 1024px`, uses `Outline` and `Comments` tabs, and never renders an empty Outline tab. When fewer than two headings exist it selects Comments. The panel is sticky below the app navigation and has its own vertical scrolling area.

Do not render the full bottom comment list while side comments are active; keep the user's existing side/bottom preference and provide a `View all at bottom` action that scrolls to the bottom section.

- [ ] **Step 6: Build the mobile dock and accessible drawers**

`ResearchMobileDock` is shown at `<= 640px` and contains exactly three actions in editing/reading context:

- Reading: Edit, Comments, Outline (omit Outline if fewer than two headings).
- Editing: metadata toggle, save status, Done.

Enhance `ResearchCommentDrawer` to restore focus to its trigger, focus the close button when opened, close on `Escape`, lock body scroll, and use `aria-labelledby` rather than only `aria-label`. Reuse the drawer for the mobile outline.

- [ ] **Step 7: Update reading styles**

In `globals.css`:

- keep `.research-prose` at `16px–17px` and `1.8–1.9` line height;
- prevent page-level horizontal overflow;
- confine table/pre overflow to the element;
- keep sticky toolbar/progress offsets below the responsive navigation;
- hide desktop context at `<1024px`;
- reserve bottom safe-area padding when the mobile dock is visible;
- honor `prefers-reduced-motion` for progress and smooth scrolling.

- [ ] **Step 8: Run reading tests on all viewports**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "reading|outline"
```

Expected: desktop, tablet, and mobile reading/outline tests pass with no horizontal overflow.

- [ ] **Step 9: Run TypeScript and lint**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/notes/page.tsx 'src/app/research/[id]/ResearchArticleShell.tsx' 'src/app/research/[id]/ResearchOutline.tsx' 'src/app/research/[id]/ResearchMetaBar.tsx' 'src/app/research/[id]/ResearchCommentDrawer.tsx' src/app/research/_components/ResearchContextPanel.tsx src/app/research/_components/ResearchMobileDock.tsx src/lib/i18nResearch.ts e2e/research-document-experience.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 10: Commit the reading experience**

```bash
git add frontend/src/app/notes/page.tsx 'frontend/src/app/research/[id]/ResearchArticleShell.tsx' 'frontend/src/app/research/[id]/ResearchOutline.tsx' 'frontend/src/app/research/[id]/ResearchMetaBar.tsx' 'frontend/src/app/research/[id]/ResearchCommentDrawer.tsx' frontend/src/app/research/_components/ResearchContextPanel.tsx frontend/src/app/research/_components/ResearchMobileDock.tsx frontend/src/lib/i18nResearch.ts frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: refine research reading experience"
```

---

### Task 4: Contextual Comments and Stable Text Annotations

**Files:**

- Modify: `frontend/src/app/notes/page.tsx:1436-1653,2689-3014`
- Modify: `frontend/src/app/research/[id]/ResearchCommentRail.tsx`
- Modify: `frontend/src/app/research/[id]/ResearchCommentCard.tsx`
- Modify: `frontend/src/app/research/_components/ResearchContextPanel.tsx`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Modify: `frontend/src/app/globals.css:453-527,863-960`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**

- Consumes: current `QuoteAnchor`, `NoteComment`, `submitComment`, reaction callbacks, Task 3 context panel, and backend `anchor_status`.
- Produces: stable selection-comment controls, context-panel activation, bottom comment summary, and explicit moved-anchor presentation. No new comment API is introduced.

- [ ] **Step 1: Add annotation and comment tests**

```ts
test("selected text stays highlighted until its comment is sent or cancelled", async ({ page }) => {
  await openMarkdownResearch(page);
  await selectText(page, "Keep researching the company");
  await expect(page.getByRole("button", { name: "Add comment" })).toBeVisible();
  await page.getByRole("button", { name: "Add comment" }).click();
  await expect(page.locator("mark.note-annotation-mark.is-pending")).toContainText("Keep researching the company");
  await page.getByPlaceholder("Write your thought…").fill("Validate after earnings 👍");
  await page.getByRole("button", { name: "Send comment" }).click();
  await expect(page.locator("mark.note-annotation-mark")).toContainText("Keep researching the company");
  await expect(page.getByText("Validate after earnings 👍")).toBeVisible();
});

test("a moved annotation remains readable from the comment panel", async ({ page }) => {
  await openResearchWithMovedComment(page);
  await page.getByRole("tab", { name: "Inline comments" }).click();
  await expect(page.getByText("Source moved")).toBeVisible();
  await expect(page.getByText("Original quoted sentence")).toBeVisible();
});
```

- [ ] **Step 2: Run annotation tests and verify the intended gaps**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --project=desktop --grep "selected text|moved annotation"
```

Expected: context-panel placement and moved-anchor presentation assertions fail before integration.

- [ ] **Step 3: Preserve the selected range and comment action**

Keep the cloned `Range` and `QuoteAnchor` in refs when the user finishes selecting. Render the pending mark immediately and do not clear it on toolbar/composer pointer-down. Clear only on explicit cancel, successful submit, edit-mode entry, or a new selection.

Use a viewport-clamped action position:

```ts
const left = Math.min(window.innerWidth - 76, Math.max(76, rect.left + rect.width / 2));
const top = Math.max(72, rect.bottom + 10);
```

The button label remains `Add comment` / `添加评论`; annotation selection/highlight continues to use the dedicated `--annotation-*` palette rather than `--accent`.

- [ ] **Step 4: Integrate annotation activation with the context panel**

Clicking an existing mark must:

1. set `activeCommentId`;
2. select the Comments context tab;
3. scroll `#annotation-card-{id}` into view on desktop;
4. open the comments drawer on phone/tablet;
5. leave the article scroll position stable.

Clicking a comment card uses the reverse path: locate the corresponding mark, scroll it into view, and add `is-active` without changing text color.

- [ ] **Step 5: Clarify comment composition and moved anchors**

Keep reply and Emoji behavior. Label annotation submission `Send comment` / `发送评论`, not `Publish`. Disable the send button only for empty/submitting states. Preserve the draft after a failed request. Show `anchor_status` values other than `active`, `ok`, or `resolved` as `Source moved` / `原文已变化`, retain `quoteText`, and do not add a client-only “resolved” toggle.

The bottom summary always includes standalone comments. When the user selects bottom view, it also includes inline comments in document order.

- [ ] **Step 6: Run comment tests across viewports**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "comment|annotation"
```

Expected: desktop, tablet, and mobile projects pass.

- [ ] **Step 7: Run TypeScript and lint**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/notes/page.tsx 'src/app/research/[id]/ResearchCommentRail.tsx' 'src/app/research/[id]/ResearchCommentCard.tsx' src/app/research/_components/ResearchContextPanel.tsx src/lib/i18nResearch.ts e2e/research-document-experience.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 8: Commit the comment experience**

```bash
git add frontend/src/app/notes/page.tsx 'frontend/src/app/research/[id]/ResearchCommentRail.tsx' 'frontend/src/app/research/[id]/ResearchCommentCard.tsx' frontend/src/app/research/_components/ResearchContextPanel.tsx frontend/src/lib/i18nResearch.ts frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: polish research comments and annotations"
```

---

### Task 5: Decision Overview as a Focused Action Queue

**Files:**

- Modify: `frontend/src/app/decision/page.tsx`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/app/globals.css`
- Test: `frontend/e2e/research-document-experience.spec.ts`

**Interfaces:**

- Consumes: existing `api.getWorkbenchOverview()`, `api.listWatchStocks()`, `api.listNotes()`, and the unchanged `WorkbenchOverview` type.
- Produces: a responsive priority queue with direct links to research, candidates, plans, and transaction reviews. No new endpoint or aggregate is added.

- [ ] **Step 1: Add decision overview tests**

Mock each non-empty workbench group and assert the page prioritizes work instead of decorative statistics:

```ts
test("decision overview presents every actionable queue with direct links", async ({ page }) => {
  await installDecisionRoutes(page);
  await loginAndOpen(page, "/decision");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Review thesis.*NVDA/ })).toHaveAttribute("href", "/watchlist/115");
  await expect(page.getByRole("link", { name: /Review research.*Margin durability/ })).toHaveAttribute("href", "/research/1");
  await expect(page.getByRole("link", { name: /Open plan.*MSFT/ })).toHaveAttribute("href", /\/assets\//);
  await expect(page.getByRole("link", { name: /Create review.*AAPL/ })).toHaveAttribute("href", /\/research\/new\?transaction=/);
});

test("decision overview becomes one column without horizontal overflow", async ({ page }) => {
  await installDecisionRoutes(page);
  await loginAndOpen(page, "/decision");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
```

- [ ] **Step 2: Run decision tests and verify the missing queues fail**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "decision overview"
```

Expected: active-plan and unreviewed-transaction links fail because the current page does not render those queues.

- [ ] **Step 3: Replace the dashboard-like composition with an action-first layout**

Keep the existing header actions. Replace the four large metric tiles and stacked guidance cards with:

```text
Needs attention
├─ Decision zone candidates
├─ Due research
├─ Missing thesis / invalidation evidence
├─ Active trade plans
└─ Transactions awaiting review

Recent decision records
Decision checklist (compact, collapsible on phone)
```

Order items by urgency: overdue/due research, decision-zone candidates, incomplete evidence, active plans, then unreviewed transactions. Each row shows one reason, one primary label, one short detail, and one direct action. Cap each group at five entries and link the group heading to its owning module.

- [ ] **Step 4: Add the currently omitted actionable data**

Render `overview.active_plans` with a direct asset or trade-plan route already supported by the returned IDs. Render `overview.unreviewed_transactions` with:

```ts
const reviewHref = `/research/new?transaction=${item.id}&asset=${item.asset_id}`;
```

Keep recent research records below the queue and show created/updated distinction. Remove the separate quantitative-promotion card; quantitative evidence remains reachable through the linked candidate detail.

- [ ] **Step 5: Apply responsive and accessible styling**

Use semantic sections and headings, visible keyboard focus, and list rows that remain one column through tablet/phone widths. On desktop, only the compact decision checklist may occupy a narrow second column; the action queue keeps the widest area. Counts appear as small badges beside section labels, not as dashboard KPI tiles.

Reuse existing translations where their meaning is unchanged. Add new decision strings to every locale dictionary already present in `i18n.ts`, using the English string as a safe fallback for locales without a reviewed translation.

- [ ] **Step 6: Run decision tests across viewports**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "decision overview"
```

Expected: desktop, tablet, and mobile projects pass.

- [ ] **Step 7: Run TypeScript and lint**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/decision/page.tsx src/lib/i18n.ts e2e/research-document-experience.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 8: Commit the decision overview**

```bash
git add frontend/src/app/decision/page.tsx frontend/src/lib/i18n.ts frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts
git commit -m "feat: focus the decision overview on actions"
```

---

### Task 6: Research Library Context, Filters, Cards, and Topics

**Files:**

- Create: `frontend/src/app/research/_components/ResearchLibraryToolbar.tsx`
- Create: `frontend/src/app/research/_components/ResearchFilterDrawer.tsx`
- Modify: `frontend/src/app/notes/page.tsx:859-1435,1654-1766`
- Modify: `frontend/src/app/notes/series/page.tsx`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Modify: `frontend/src/app/globals.css:529-762,877-942`
- Test: `frontend/e2e/research-document-experience.spec.ts`
- Test: `frontend/e2e/personal-investment-flow.spec.ts`

**Interfaces:**

- Consumes: current `NoteScope`, `NotesSort`, `NotesStyle`, tags/topics counts, and Next.js router/search params.
- Produces:

```ts
export interface ResearchLibraryFilters {
  query: string;
  scope: "all" | "favorites" | "due" | "active" | "archived" | "linked" | "unlinked";
  sort: "latest" | "created" | "review_due";
  view: "cards" | "reading";
  tag: string | null;
  topic: string | null;
}

export interface ResearchLibraryToolbarProps {
  value: ResearchLibraryFilters;
  counts: Record<ResearchLibraryFilters["scope"], number>;
  activeFilterCount: number;
  onChange: (patch: Partial<ResearchLibraryFilters>) => void;
  onClear: () => void;
}
```

- [ ] **Step 1: Add library and topic UX tests**

```ts
test("research library restores filters and scroll after reading", async ({ page }) => {
  await openResearchLibrary(page);
  await page.getByRole("button", { name: "Starred" }).click();
  await page.getByRole("button", { name: "Card view" }).click();
  await page.evaluate(() => window.scrollTo(0, 640));
  await page.getByRole("heading", { name: "Initial thesis" }).click();
  await page.getByRole("button", { name: "Research library" }).click();
  await expect(page.getByRole("button", { name: "Starred" })).toHaveAttribute("aria-pressed", "true");
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(400);
});

test("mobile filters use a drawer and expose active count", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile");
  await openResearchLibrary(page);
  await page.getByRole("button", { name: "Filters" }).click();
  await expect(page.getByRole("dialog", { name: "Research filters" })).toBeVisible();
  await page.getByRole("button", { name: "Due for review" }).click();
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByRole("button", { name: /Filters, 1 active/ })).toBeVisible();
});

test("topic detail has one back action and readable document cards", async ({ page }) => {
  await openResearchTopic(page);
  await expect(page.getByRole("button", { name: "Back to topic list" })).toHaveCount(1);
  await expect(page.getByRole("link", { name: "Initial thesis" })).toBeVisible();
});
```

- [ ] **Step 2: Run library/topic tests and verify failures**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "library|filters|topic"
```

Expected: context restoration, mobile drawer, and duplicate topic-back control assertions fail.

- [ ] **Step 3: Build the unified library toolbar**

Replace the decorative multi-panel hero with a compact header containing title, one-line description, search, Topics, and New research. Place scopes, sort, and card/manuscript view controls in `ResearchLibraryToolbar`.

Desktop/tablet keeps scopes visible and places secondary filters in one expandable row. Phone shows search, New research, scope shortcuts, and a `Filters` button; `ResearchFilterDrawer` owns sort, topic, tag, linked state, and clear/apply actions.

Filter controls use `aria-pressed`; the drawer uses the same focus/escape/body-lock pattern as Task 3.

- [ ] **Step 4: Persist list context without a second data source**

Encode filter state in `/research` query parameters:

```text
/research?q=nvda&scope=due&sort=review_due&view=cards&tag=AI&topic=Semiconductors
```

Omit default values. Use `router.replace` with `{ scroll: false }`. Preserve legacy `series` by translating it once to `topic` and replacing the URL. Before opening a detail, store only scroll position in `sessionStorage` under `seekcost:research-library-scroll`; on returning to `/research`, restore it once after cards render. The URL remains the source of truth for filters.

- [ ] **Step 5: Refine card and manuscript views**

For card view:

- equal height per responsive row;
- real image cover when present;
- low-saturation title background from the existing independent palette when absent;
- title, conclusion excerpt, state, linked symbols, review date, and updated time;
- whole-card open target with separate star/more controls.

For manuscript view:

- no decorative image requirement;
- title, two-line conclusion, metadata, and compact actions;
- keyboard-visible focus state for the main link and icon actions.

Remove redundant stat tiles from the hero; keep counts beside their scope controls.

- [ ] **Step 6: Simplify topic list and detail**

In `notes/series/page.tsx`, remove the duplicate Back button, keep one fixed route per topic, and align topic cards with the library's document hierarchy. The topic detail header contains Back, title, description, item count, updated date, Star, and Edit. Research rows contain title, two-line excerpt, created/updated timestamps, and comment count.

On phone, topic creation/editing uses a full-width sheet with name, Markdown description editor, Cancel, Save, and guarded Delete. It must not render a side column narrower than `220px`.

- [ ] **Step 7: Run library and topic tests across viewports**

Run:

```bash
cd frontend
npx playwright test e2e/research-document-experience.spec.ts --grep "library|filters|topic"
npx playwright test e2e/personal-investment-flow.spec.ts --grep "research|topic"
```

Expected: all scoped tests pass on desktop, tablet, and mobile.

- [ ] **Step 8: Run TypeScript and lint**

Run:

```bash
cd frontend
npx tsc --noEmit
npx eslint src/app/notes/page.tsx src/app/notes/series/page.tsx src/app/research/_components/ResearchLibraryToolbar.tsx src/app/research/_components/ResearchFilterDrawer.tsx src/lib/i18nResearch.ts e2e/research-document-experience.spec.ts e2e/personal-investment-flow.spec.ts
```

Expected: both commands exit with code `0`.

- [ ] **Step 9: Commit the library and topic experience**

```bash
git add frontend/src/app/notes/page.tsx frontend/src/app/notes/series/page.tsx frontend/src/app/research/_components/ResearchLibraryToolbar.tsx frontend/src/app/research/_components/ResearchFilterDrawer.tsx frontend/src/lib/i18nResearch.ts frontend/src/app/globals.css frontend/e2e/research-document-experience.spec.ts frontend/e2e/personal-investment-flow.spec.ts
git commit -m "feat: streamline research library and topics"
```

---

### Task 7: Full Responsive, Accessibility, and Production Verification

**Files:**

- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nResearch.ts`
- Modify: only decision-record files identified by failures in the commands below
- Test: `frontend/e2e/research-autosave-editing.spec.ts`
- Test: `frontend/e2e/research-document-experience.spec.ts`
- Test: `frontend/e2e/personal-investment-flow.spec.ts`
- Test: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**

- Consumes: completed Tasks 1–6.
- Produces: verified decision-record flows at `1440×1000`, `834×1112`, and `390×844`, with no backend/schema changes.

- [ ] **Step 1: Add an overflow and touch-target audit test**

```ts
for (const path of ["/research", "/research/1", "/research/new", "/research/topics", "/research/topics/1"]) {
  test(`${path} has no page-level horizontal overflow`, async ({ page }) => {
    await installResearchExperienceRoutes(page);
    await loginAndOpen(page, path);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}
```

For the mobile project, query visible primary buttons in the research toolbar/dock and assert their bounding-box height is at least `44`.

- [ ] **Step 2: Run the full decision-record Playwright suite**

Run:

```bash
cd frontend
npx playwright test e2e/research-autosave-editing.spec.ts e2e/research-document-experience.spec.ts e2e/personal-investment-flow.spec.ts e2e/responsive-surfaces.spec.ts
```

Expected: all four files pass across the configured projects. If a pre-existing assertion conflicts with the approved design, update that assertion to the new user-visible behavior; do not weaken access-control or data-loss assertions.

- [ ] **Step 3: Perform the keyboard and accessibility pass**

Verify with Playwright that:

- Tab reaches Back, Star, Edit, context tabs, comment composer, and mobile dock in visual order.
- Focus rings remain visible.
- `Escape` closes editor popovers and drawers and restores trigger focus.
- save-state changes use `aria-live="polite"`.
- drawers use `role="dialog"`, `aria-modal="true"`, and a visible labelled heading.
- buttons with only symbols have localized accessible names.
- research load, save, conversion, and comment failures retain user input and expose a retry or safe return action.

Add exact assertions to `research-document-experience.spec.ts` for every failed check, implement the smallest fix, and rerun that test file.

- [ ] **Step 4: Verify both locales**

Run the document experience once with `seekcost:locale=en` and once with `seekcost:locale=zh-CN`. Assert the library title, editor mode names, save states, comment action, Outline/Comments tabs, and mobile Filters copy in each locale. Missing translations must be added to both dictionaries in `i18nResearch.ts`.

- [ ] **Step 5: Run final static and production checks**

Run:

```bash
cd frontend
npm run lint
npx tsc --noEmit
npm run build
```

Expected: lint, TypeScript, and the Next.js production build all exit with code `0`.

- [ ] **Step 6: Confirm no backend or integration scope leaked in**

Run:

```bash
git diff --name-only 30cb603..HEAD
git diff 30cb603..HEAD -- backend
rg -n "BLEX|localhost:8000|block_json|collaborator" frontend/src/app/notes frontend/src/app/research frontend/src/components/MarkdownEditor.tsx frontend/src/lib/i18nResearch.ts
```

Expected: the backend diff is empty and the scoped search has no newly introduced integration, block-model, or collaboration code.

- [ ] **Step 7: Commit final responsive and accessibility fixes**

```bash
git add frontend/src/app/globals.css frontend/src/lib/i18nResearch.ts frontend/e2e/research-autosave-editing.spec.ts frontend/e2e/research-document-experience.spec.ts frontend/e2e/personal-investment-flow.spec.ts frontend/e2e/responsive-surfaces.spec.ts frontend/src/app/notes frontend/src/app/research frontend/src/components/MarkdownEditor.tsx frontend/src/components/MarkdownToolbar.tsx
git commit -m "test: verify decision record experience"
```

Only stage files that actually changed in this task; remove unchanged paths from the `git add` invocation before committing.
