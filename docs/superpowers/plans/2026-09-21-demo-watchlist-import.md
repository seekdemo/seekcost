# Demo Watchlist Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox tracking.

**Goal:** Replace the ordinary demo account's fictional watchlist with the user-authorized Futu CSV union while retaining real source classifications and protecting unrelated records.

**Architecture:** Explicit CLI reads code/name/market CSVs, normalizes market-qualified symbols, merges categories and filename themes, previews changes by default and applies one transaction only with --apply. It refuses non-fixture records and research drafts rather than overwriting them. Raw files remain in Downloads, not Git.

**Tech Stack:** Python CSV, SQLAlchemy, SQLite encrypted backup, Pytest, live API verification.

## Global Constraints

## Execution results (2026-09-22)

Completed all tasks below. Two importer tests pass; preview and repeat preview verified.
Applied 346 entries (215 US, 131 mainland China), seven themes; 342 created,
four retained, four obsolete fixtures removed. Cleared 31 fixture/empty related
records and two fictional notifications; five linked notes archived. Five assets
and six transactions unchanged. Live API and desktop/mobile company picker show
346 entries; mobile has no horizontal overflow. README updated; raw CSVs untouched.
Encrypted backups: `seekcost-20260922T014220Z-a19788101dbb43c8b32b63151bdfe7f4.sql.fernet`
(before), `seekcost-20260922T014316Z-14c4b2b281f640848fdd4ae0dc1fc758.sql.fernet` (after),
in ignored `backend/backups/`. Retain the separate backup key for recovery.

- Only username demo, refuse SiteAdmin, preserve other accounts and synthetic assets/transactions.
- Input authority: user confirmed all self-selected watchlists are prepared for demo. Do not read/import brokerage transactions.
- Preserve exchange-qualified Chinese symbols, remove US suffix, merge duplicates by canonical symbol; latest specified file wins name, classification unions persist.
- No fabricated price/fundamental values. Clear prior fake anchors and dated earnings; archive fictional linked notes, retain their content.
- Back up before and after. Execute inline; executing-plans unavailable. No commit/push.

### Task 1: Safe merge and replacement

Files: backend/app/core/demo_watchlist_import.py, backend/tests/test_demo_watchlist_import.py.

- [ ] Add tests: CSV symbols NVDA.US / 600519.SH remain distinct, categories union, invalid columns/empty file rejected, non-demo ownership untouched, user drafts block replacement, preview performs no writes, repeated apply idempotent.
  Assertions: `assert symbols == {'NVDA','600519.SH'}`; `assert report['removed'] == 1`; `assert other.name == 'Private'`.
- [ ] Implement `parse_sources(paths)` and `replace_demo_watchlist(db, items, apply=False)` with bounded fields, atomic transaction and explicit owner checks.
- [ ] Run `.venv/bin/python -m pytest tests/test_demo_watchlist_import.py -q`.

### Task 2: Apply and verify

- [ ] Run default preview against all authorized watchlist CSVs, verify 346 unique symbols and group counts; check no protected research or modified fixture conflicts.
- [ ] Create encrypted backup, run same command with --apply, rerun preview for 0 creates/removals; verify live endpoints and browser picker.
- [ ] Update README to distinguish current local imported watchlist from optional fictional seed fixtures; record counts and encrypted backup, report archived/deleted examples and recovery path.
