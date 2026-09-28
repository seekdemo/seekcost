# Memo Autosave Implementation Plan

> Execute inline; executing-plans unavailable. No real demo saves or deletions during verification.

**Goal:** Replace manual memo submission with a quiet auto-saving writing card and editable memo list.
**Architecture:** A separate QuickMemoPad owns draft, active ID and serialized debounce state; ResearchSupportPanel retains backend operations and linked-research integration. Existing POST/PATCH endpoints remain unchanged.
**Tech Stack:** React, CSS, Playwright.

- [x] Create QuickMemoPad with 900ms debounce, stable ID after first create, queued edits during saves, explicit failure retry, IME composition guard and unload warning. Disable switching drafts until saved; allow restoring last saved text.
- [x] Integrate parent operations using current profile ref, retain pin/convert, add delete confirmation, update only matching memo.
- [x] Style responsive composer, timestamped cards and active item using theme tokens.
- [x] Fixture-test create-once/update, delayed responses, failure/retry, new/edit and delete cancellation; screenshot desktop/mobile; run type/lint/build.

Verification: six autosave tests passed across desktop/tablet/mobile. Screenshots inspected and an inherited textarea focus border plus an existing untranslated action label corrected. TypeScript, targeted lint and production build passed. Only mocked memo writes/deletes used in tests; no live data changed.

No commits, schema changes or real data mutations are included. A failed create is not automatically retried because POST outcome may be uncertain.
