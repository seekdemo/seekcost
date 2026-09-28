# Markdown-first research experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax to track progress.

**Goal:** Make every long-form SeekCost editor Markdown-first with safe preview and improve private research article reading and anchored comments, after removing the `seekdemo` dataset.

**Architecture:** Keep existing string API fields and the notes `format` contract. Extract one shared GFM Markdown parser/sanitizer and a responsive `MarkdownEditor`; use Markdown as the canonical value for newly edited long-form fields while retaining the existing rich editor surface where it already exists. Refactor research detail into an article shell plus independent outline, annotation rail, drawer, and comment-card units.

**Tech Stack:** Next.js 16, React 19, TypeScript, Tailwind CSS, FastAPI, SQLAlchemy async, Alembic, SQLite/PostgreSQL, pytest, Playwright.

## Global Constraints

- Delete only the explicit `seekdemo` account and its owned data; preserve tables, migrations, source code, and unrelated dirty-worktree changes.
- New long-form content defaults to Markdown; short memos, earnings notes, cash notes, and comment replies remain lightweight inputs.
- Do not add public/community distribution or BLEX integration.
- Render Markdown with GFM tables, task lists, code blocks, links, and safe URL handling; never execute raw HTML or scripts.
- Desktop uses split editor/preview and a side annotation rail; mobile uses editor/preview tabs and a bottom comment drawer.
- Failed saves preserve drafts and comments remain owner-scoped.
- Use `apply_patch`; stage only files belonging to this feature.

---

### Task 1: Idempotent demo-account cleanup

**Files:**
- Create: `backend/app/core/demo_cleanup.py`
- Create: `backend/scripts/clear_demo_user.py`
- Create: `backend/tests/test_demo_cleanup.py`

**Interfaces:**
- `async def preview_user_cleanup(db: AsyncSession, username: str) -> CleanupReport`
- `async def clear_user_data(db: AsyncSession, username: str) -> CleanupReport`
- `CleanupReport(username: str, user_id: int | None, deleted: dict[str, int])`

- [ ] Write tests with an in-memory database containing a user, note/comments/reactions, watch stock/research/earnings, asset/transactions/trade plan, and dependent rows; assert preview has counts and does not mutate.
- [ ] Add a failing test asserting `clear_user_data` deletes dependencies before parents, removes the user row, commits once, and a second call returns zero counts.
- [ ] Implement table-id collection and explicit deletion order using SQLAlchemy Core statements; keep unknown/missing rows harmless and avoid disabling foreign keys.
- [ ] Implement the CLI with `--username`, `--confirm`, and `--dry-run`; print JSON counts, require `--confirm` for mutation, and rollback on exceptions.
- [ ] Run `pytest -q tests/test_demo_cleanup.py` and execute a dry-run against `/tmp/seekcost-dev.db`.
- [ ] Run the confirmed cleanup for `seekdemo`, verify all owned counts are zero and `alembic_version` is unchanged; record the before/after output without committing the database.
- [ ] Commit: `feat: add idempotent demo account cleanup`.

### Task 2: Shared Markdown core

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/lib/markdown/types.ts`
- Create: `frontend/src/lib/markdown/renderMarkdown.tsx`
- Create: `frontend/src/lib/markdown/convertClipboard.ts`
- Create: `frontend/src/lib/markdown/index.ts`
- Create: `frontend/src/lib/markdown/renderMarkdown.test.ts`

**Interfaces:**
- `type MarkdownValue = { source: string; format: "markdown" | "rich" }`
- `renderMarkdown(source: string): ReactNode`
- `sanitizeMarkdownUrl(url: string): string | null`
- `htmlClipboardToMarkdown(html: string): string`

- [ ] Add `react-markdown`, `remark-gfm`, and `rehype-sanitize` dependencies with exact lockfile updates.
- [ ] Write tests for headings, nested lists, GFM tables/tasks, fenced code, quotes, safe https links, removal of javascript/data URLs, raw HTML removal, and empty source.
- [ ] Implement the renderer with a fixed safe schema, `remark-gfm`, and custom code/pre/table components that preserve readable overflow on narrow screens.
- [ ] Implement clipboard conversion preferring plain text; convert supported clipboard HTML tags to Markdown and strip unsupported embedded media/scripts.
- [ ] Run the focused Markdown tests and frontend TypeScript check.
- [ ] Commit: `feat: add shared markdown rendering core`.

### Task 3: Responsive Markdown editor

**Files:**
- Create: `frontend/src/components/MarkdownEditor.tsx`
- Create: `frontend/src/components/MarkdownToolbar.tsx`
- Create: `frontend/src/components/MarkdownPreview.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Create: `frontend/e2e/markdown-editor.spec.ts`

**Interfaces:**
- `MarkdownEditor({ label, value, onChange, placeholder, minHeight, defaultMode, tone, saveState, onSave })`
- `MarkdownPreview({ source, emptyLabel, className })`

- [ ] Write Playwright assertions for Markdown default mode, editor/preview toggle, desktop split layout, mobile tabs, toolbar insertion, AI-style paste, safe preview, keyboard shortcut, and failed-save draft retention.
- [ ] Build a controlled textarea editor with selection-aware toolbar commands for heading/list/quote/code/link/table; preserve selection after toolbar use.
- [ ] Add plain-text Markdown paste and HTML fallback conversion, plus a warning when unsupported clipboard structures were removed.
- [ ] Render preview beside the editor at `min-width: 1024px`; render accessible tabs below that breakpoint; keep controls at least 40px high and prevent horizontal overflow.
- [ ] Add unsaved state, `Ctrl/Cmd+Enter` save shortcut, save failure callback, and `beforeunload` protection only while dirty.
- [ ] Run focused ESLint, TypeScript, and Playwright tests.
- [ ] Commit: `feat: add responsive markdown editor and preview`.

### Task 4: Migrate long-form watchlist, trade-plan, and finance fields

**Files:**
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchSectionEditor.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchEvidenceList.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchQuestionList.tsx`
- Modify: `frontend/src/app/assets/[id]/page.tsx`
- Modify: `frontend/src/app/trade/page.tsx`
- Modify: `frontend/src/app/review/page.tsx`
- Modify: `frontend/src/app/notes/series/page.tsx`
- Modify: `frontend/src/lib/api.ts` and `frontend/src/lib/types.ts` as needed for typed values.

- [ ] Replace duplicated long-form rich text implementations with `MarkdownEditor`; keep short notes as textareas.
- [ ] Make company judgment, research review note, business/growth/risk/thesis/invalidation, trade strategies, trade-plan discipline, review conclusions, and topic descriptions Markdown-first.
- [ ] Preserve current API field names and HTML compatibility for existing rich values; normalize only on explicit save.
- [ ] Remove local duplicate Markdown parsers from large page components after shared renderer parity tests pass.
- [ ] Add E2E coverage for each migrated page’s edit/save/preview path and explicit rollback on API failure.
- [ ] Run page-level lint/type checks and commit: `feat: migrate investment long-form editors to markdown`.

### Task 5: Research article reading shell

**Files:**
- Modify: `frontend/src/app/research/[id]/page.tsx`
- Create: `frontend/src/app/research/[id]/ResearchArticleShell.tsx`
- Create: `frontend/src/app/research/[id]/ResearchOutline.tsx`
- Create: `frontend/src/app/research/[id]/ResearchMetaBar.tsx`
- Modify: `frontend/src/lib/i18nResearch.ts`

- [ ] Write E2E checks for title metadata, stock/topic links, status/star actions, reading progress, generated heading outline, and article rendering on desktop/tablet/mobile.
- [ ] Implement the reading-first shell with an 800px article column, calm typography, safe Markdown blocks, sticky desktop outline, and responsive metadata actions.
- [ ] Add heading IDs and outline navigation that scrolls without changing the fixed URL or losing comment context.
- [ ] Keep edit mode at a stable `/research/[id]` address and preserve return filters in navigation state/query parameters.
- [ ] Verify no horizontal overflow and commit: `feat: redesign research article reading shell`.

### Task 6: Anchored comment rail and mobile drawer

**Files:**
- Create: `frontend/src/app/research/[id]/ResearchCommentRail.tsx`
- Create: `frontend/src/app/research/[id]/ResearchCommentCard.tsx`
- Create: `frontend/src/app/research/[id]/ResearchCommentDrawer.tsx`
- Modify: `frontend/src/app/research/[id]/page.tsx`
- Modify: `frontend/src/lib/api.ts`, `frontend/src/lib/types.ts`, and `frontend/src/lib/i18nResearch.ts`
- Create: `frontend/e2e/research-comments.spec.ts`

- [ ] Write tests for text selection, warm persistent highlights, add-comment floating action, side/bottom view switching, locating comments, replies, emoji reactions, anchor mismatch state, keyboard publish, and failed-save draft retention.
- [ ] Extract selection/anchor state from the page into a hook that stores quote text, prefix/suffix, offsets, and block ID; keep selected highlights after save.
- [ ] Implement desktop rail, tablet collapsible panel, and mobile bottom drawer; avoid generic interaction modules or cross-user content.
- [ ] Implement comment cards with quote, author/time, reply, reaction, locate, and owner-only edit/delete actions; retain read-only historical comments.
- [ ] Persist the user’s comment view preference through the existing profile settings API (with a migration only if required); use a safe default when unavailable.
- [ ] Run focused E2E at all configured viewports and commit: `feat: refine private research comments`.

### Task 7: Full verification and handoff

**Files:**
- Modify: relevant tests only when failures expose this feature’s regressions.
- No changes to unrelated dirty-worktree files.

- [ ] Run backend `pytest -q` and migration upgrade checks.
- [ ] Run frontend ESLint, `tsc --noEmit --incremental false`, and `npm run build`.
- [ ] Run focused and full Playwright suites at desktop/tablet/mobile; investigate failures rather than masking them.
- [ ] Check `git diff --check`, inspect staged paths, and verify `/health` plus `/research/[id]`/`/watchlist/[id]` return successfully after restarting services.
- [ ] Commit only remaining feature changes: `chore: verify markdown research experience`.
