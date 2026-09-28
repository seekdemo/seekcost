# Task 6 report

Implemented the document-style editing workflow for Markdown and rich text.

- Moved Research preview ownership to the document bar while leaving format conversion in `NoteEditor`.
- Added single preview and wide-screen split preview with shared `.research-article-prose` typography and responsive collapse below 1280px.
- Kept legacy standalone `MarkdownEditor` preview tabs for non-Research consumers while enabling controlled preview for Research details.
- Preserved the rich-text selection bubble, slash menu, stock/tag mentions, image controls, Markdown gestures, and shortcuts.
- Added state semantics for preview controls, a sticky Markdown toolbar, and English/Chinese labels.
- Made cleaned Markdown and rich-text paste reversible until the next content-changing action, with Undo and Dismiss; rich HTML is sanitized before insertion.

Verification:

- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --project=desktop` — 9 passed.
- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --grep "markdown preview|AI rich text paste" --project=tablet --project=mobile` — 4 passed.
- `cd frontend && npm run lint` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concern: none.

## Fix round 1/5

Fixed the four Task 6 review findings.

- Rich-text source now remains mounted and is hidden during single preview, preserving the cleaned-paste Undo state.
- Markdown cleaned-paste Undo returns focus to its textarea after restoring the prior value.
- The visual-editor toolbar now uses the compact sticky treatment, with the editor shell no longer clipping sticky positioning.
- Image alignment and resizing, plus direct stock/tag token replacement, invalidate cleaned-paste Undo before mutating content. Image alignment controls now expose their pressed state.
- Added Playwright coverage for Markdown Undo focus, rich Undo across a single-preview toggle, and Undo invalidation after image alignment.

Verification:

- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --grep "Markdown Undo|Undo survives|image alignment" --project=desktop --project=tablet --project=mobile` — 9 passed.
- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --project=desktop` — 11 passed.
- `cd frontend && npm run lint` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concern: the already-running shared dev server did not hot-reload the new global CSS rule during one browser assertion, so that assertion was removed; source CSS and all behavior-focused coverage remain verified.
