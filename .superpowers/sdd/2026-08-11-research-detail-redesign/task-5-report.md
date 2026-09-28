# Task 5 report

Implemented the focused research editor and on-demand properties panel.

- Added `ResearchEditorShell` with a centered 840px editing canvas, labelled editor region, inline document metadata, and responsive properties host.
- Added `ResearchPropertiesPanel`; management fields, read-only updated time, and starring now live in the on-demand properties dialog instead of the editing canvas.
- Preserved the existing document bar, ordered autosave/retry API, detail URL, and reading/comment/outline flow.
- Done and Back flush active saves; a failed save keeps editing open and focuses Retry save. `beforeunload` protection is active only for dirty, saving, and failed editor state.
- Added English and Chinese labels for the focused editor, title, properties, close action, and all-changes-saved text. Mobile editing uses full-width/safe-area canvas spacing and the panel remains a bottom sheet.

Regression review:

- The properties dialog initially overrode the legacy created-time handoff; it now opens the panel and focuses the created-time field after the dialog focus cycle.
- The compact document-bar title could remain hidden on tablet/mobile editing after a deep scroll; editing mode now consistently shows the bar title.

Verification:

- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts` — 12 passed across desktop/tablet/mobile.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "reading menu opens|editing documents use|mobile document actions"` — 9 passed.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "compact title observer" --project=desktop --project=tablet --project=mobile` — 3 passed.
- `cd frontend && npm run lint && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Commit: `720bb43 feat: add focused research editor`

Concern: a complete `research-document-experience` run was started twice; desktop completed cleanly, but the runner was interrupted by the environment while tablet/mobile continued. The directly affected document-bar/layout tests and all editor/autosave coverage pass across all three projects.

---

# Task 5 fix round 1 report

Resolved the five focused-editor review findings without backend, API, model, or dependency changes.

- Added a `data-research-editing` lifecycle signal on `body` and a dedicated mobile-navigation class. The ordinary bottom navigation is hidden only while editing below `768px` and returns after Done.
- Expanded the editing canvas breakpoint from `640px` to `767px`, preserving full-width editing and safe-area spacing below `768px`.
- Completed linked-stock management in `NoteManagementFields`, added the missing translations, supplied the complete stock source to the properties panel and new-note form, and kept changes on the existing autosave path.
- Reset properties explicitly when entering and leaving the editing lifecycle, while preserving the reading menu's created-time handoff that intentionally opens the panel.
- Replaced unconditional "All changes saved" metadata with state-accurate polite live messaging for dirty, saving, saved/idle, and failed states.
- Extended `research-autosave-editing.spec.ts` for navigation visibility at `767px`/`768px`, full-width mobile layout, linked-stock persistence, properties lifecycle reset, and dirty/saving/failed metadata.

Verification:

- `cd frontend && npx playwright test e2e/research-autosave-editing.spec.ts --project=desktop --project=tablet --project=mobile` — desktop and tablet completed 14/14; a separate `--project=mobile` run completed 7/7. A repeated combined run again completed desktop/tablet before the environment detached its output channel.
- `cd frontend && npx playwright test e2e/research-document-experience.spec.ts --grep "reading menu opens|editing documents use|mobile document actions|compact title observer" --project=desktop --project=tablet --project=mobile` — 12 passed.
- `cd frontend && npm run lint` — passed.
- `cd frontend && npx tsc --noEmit` — passed.
- `git diff --check` — passed.

Concern: Playwright's combined-run output channel detached while beginning mobile in two runs, but the mobile project was rerun independently and passed all seven focused-editor tests. No product failure was observed.
