# Research detail refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; unavailable, execute sequentially.

**Goal:** Calm, legible decision-note reading with clear actions across mobile and desktop.
**Architecture:** Keep existing note persistence, autosave and annotation controllers. Align header inside article column; separate decision context from document metadata. Add scoped presentation styles and focused mobile navigation.
**Tech Stack:** Next.js / React, CSS, Playwright.

## Constraints
- No live note writes or deletions; preserve existing uncommitted work.
- Keep autosave, failure recovery, keyboard access, comment drawer and outline.
- Verify 390/834/1440 layouts and light/dark; do not promise zero defects beyond tested scope.

## Steps

## Verification (2026-09-23)

- Reading header now shares the article column; 720px reading width retained.
- Labeled status/confidence/review strip, primary edit action, readable markdown
  typography, unclipped menu, and focused mobile navigation implemented.
- Sticky controls and heading anchors use measured `--app-nav-height`.
- Live screenshots reviewed at 360/390/834/1440, dark and light; no overflow,
  more menu opens and Escape dismisses it. No live notes were modified.
- Full document/autosave run: 51 passed, one outdated test waited for the removed
  mobile bottom nav. Updated that assertion; subsequent 27 desktop/tablet/mobile
  checks all passed, including the affected case. Autosave success/failure/retry,
  linked symbols, comments, cover fallback, and editor modes passed.
- TypeScript, targeted ESLint, diff checks and production webpack build passed.
- Existing broad API fixtures were isolated from live authentication; linked-stock
  test now opens the existing collapsed selector rather than assuming it is open.
- No database changes or commit in this task.
- [ ] Inspect live note and capture before screenshots (done).
- [ ] Move header into article region in ResearchDetailView. Add labeled status/confidence/review context in NotesClient and concise primary edit button in ResearchDocumentBar.
- [ ] Scoped CSS: 720px reading column, 16px/1.9 text, clear headings, responsive context grid, focus-visible actions. Mobile detail routes hide redundant site secondary/bottom navigation while retaining back action.
- [ ] Add regression assertions: title/article aligned, context labels visible, no overflow, menu keyboard closure. Run existing document/autosave suites and TypeScript.
- [ ] Screenshot actual note desktop/mobile plus fixture light theme; inspect then deliver verified results.
