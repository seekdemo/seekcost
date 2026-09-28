# Shared Writing Editor Implementation Plan

> Execute inline; executing-plans skill is unavailable. Preserve unrelated changes and real user data.

**Goal:** Apply the supplied writing-surface design to all shared Markdown editors.
**Architecture:** Refine MarkdownEditor and MarkdownToolbar once, retaining controlled previews, mention selection, paste cleaning and parent save handlers. Scope styling to the editor; do not convert plain-text fields into Markdown storage.
**Tech Stack:** React, CSS, Next.js, Playwright.

## Tasks
- [x] Inspect the live company research edit flow using read-only browser interactions; close browser without saving.
- [x] Update `frontend/src/components/MarkdownEditor.tsx` and `MarkdownToolbar.tsx`: one toolbar, a separate paper-like writing area, clear edit/preview switch, labelled footer with save status. Keep controlled preview consumers unchanged. Fix H2 insertion to `## ` and restore textarea focus after list commands.
- [x] Add `frontend/src/components/markdown-editor.css`: responsive toolbar scrolling, theme-aware surface, visible focus, 44px touch controls, no duplicate preview actions.
- [x] Verify formatting, preview preservation, shortcut saving and failed-save draft retention with fixture-based Playwright tests. Check desktop and mobile screenshots, TypeScript and targeted lint.

## Results
- 36 research autosave/editor cases and 12 rich-field cases passed across desktop, tablet and mobile.
- TypeScript, targeted ESLint and production build passed.
- Live company editor screenshots inspected at 1440px and 390px; no page horizontal overflow. No live data saved.
- Updated stale fixture labels to Core view and isolated authentication requests; initial failures were fixture setup/old labels rather than the editor implementation.

## Contracts
`MarkdownEditor` props and save ownership remain unchanged. No backend changes, live saves, migrations or commits. `previewMode` continues to control off/single/split layouts. Formatting controls must not silently modify content in preview mode.
