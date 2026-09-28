# 研究文章自动保存编辑状态修复 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the research article editor from exiting edit mode after the first debounced auto-save.

**Architecture:** Keep the existing optimistic local update and debounced `api.updateNote` flow. Narrow the route-selection effect so it responds to the requested note and loading completion, while preserving `editingId` when the notes collection changes because of an edit.

**Tech Stack:** Next.js App Router, React hooks, TypeScript, existing `api.updateNote` client.

## Global Constraints

- Preserve the existing 450ms auto-save debounce.
- Keep local edits when an API save fails and continue showing the existing error notice.
- Do not alter research content, URL compatibility, comments, or unrelated navigation behavior.

---

### Task 1: Decouple route initialization from auto-save updates

**Files:**
- Modify: `frontend/src/app/notes/page.tsx:1040-1060`
- Test: `frontend/e2e/research-autosave-editing.spec.ts`

**Interfaces:**
- Consumes: `initialNoteId`, `searchParams`, `notes`, `activeId`, and `editingId` state already owned by `NotesContent`.
- Produces: route initialization that selects the requested note without clearing an active edit session when `notes` changes after an auto-save.

- [x] **Step 1: Add a regression test for edit persistence**

  Open a research detail page, enter edit mode, change the title or body, wait longer than the 450ms debounce, then assert the editor input remains visible and editable.

- [x] **Step 2: Run the focused test before the fix**

  Run: `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --project=chromium`

  Expected: the test demonstrates the editor disappears after the first save (or fails because the test is not yet implemented).

- [x] **Step 3: Narrow the initialization effect**

  Preserve `editingId` while the same requested note remains selected. Only clear it when the route target changes or when opening a different note. Do not remove the `notes` dependency if it is needed to wait for initial loading; guard the effect with a ref or compare the selected target before resetting edit state.

- [x] **Step 4: Run the focused test after the fix**

  Run: `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --project=chromium`

  Expected: PASS; the editor remains open after the debounced update and a second edit can be made.

- [x] **Step 5: Run static checks**

  Run: `cd frontend && npx tsc --noEmit && npm run lint`

  Expected: both commands pass without new diagnostics.

- [x] **Step 6: Commit the implementation and regression test**

  Run: `git add frontend/src/app/notes/page.tsx frontend/e2e/research-autosave-editing.spec.ts && git commit -m "fix: keep research editor open after autosave"`
