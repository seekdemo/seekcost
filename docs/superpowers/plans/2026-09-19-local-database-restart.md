# Persistent Local Restart Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Restart the authorized empty local workspace on persistent SQLite with tested, encrypted local snapshots.

**Architecture:** Keep the existing PostgreSQL deployment unchanged. Opt local SQLite into an in-process hourly encrypted snapshot loop; use SQLite's online backup API before producing an authenticated encrypted SQL export. Restore only into an exclusively created new file.

**Tech Stack:** SQLite, cryptography/Fernet, existing FastAPI lifespan, Pytest.

## Global Constraints

- User approved an empty database, not reconstruction of lost data or a default account.
- No existing files overwritten by restore, no Git commit, no change to PostgreSQL backup flow.
- Database and key go in backend/data; encrypted snapshots in backend/backups; both ignored by Git, directories 0700, files 0600.
- Execute inline; executing-plans unavailable. Same-machine backup is not disaster recovery.

### Task 1: Backup and restore safety

Files: backend/app/core/sqlite_backup.py, backend/tests/test_sqlite_backup.py, backend/app/core/config.py, backend/app/main.py.

- [x] Test `backup_database(source, directory, key)` preserves synthetic rows, is encrypted, and `restore_database(archive, key, target)` rejects an existing target.
- [x] Implement snapshot using `sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)` and `source.backup(memory)`; encrypt `memory.iterdump()` with Fernet. Exclusively create key and unique timestamp archive with mode 0600. Refuse missing keys when archives exist.
- [x] Configure `SQLITE_BACKUP_DIR` (empty disables), interval >=60 seconds, run immediately on startup then hourly. Log errors and expose non-sensitive health status. Cancel background task on shutdown.
- [x] Run isolated backup and related API tests; never use real data in tests.

### Task 2: Restart and verify

Files: backend/.env (ignored), .gitignore, docs/BACKUP.md.

- [x] Change only local database/backup environment values to persistent absolute project paths; create private directories and start backend with umask 077.
- [x] Verify readiness, registration enabled, zero users, nonempty schema, encrypted initial snapshot and new-file recovery. Preserve the empty database baseline; do not create shared demo credentials.
- [x] Verify frontend login/register pages and same-origin API proxy. Record commands and local backup limits in docs; report need to register a new account and separately store the key.

## Verification

- 7 focused tests passed (encrypted snapshot/restore, refusal to overwrite, missing source/key and incorrect key handling, self-hosted authentication checks).
- New persistent database: 37 tables, 0 users. Database/key permissions 0600; storage directories 0700; all ignored by Git.
- Actual initial encrypted snapshot restored into a temporary isolated database; SQLite integrity_check returned ok and users remained 0. Temporary verification copy removed, source and encrypted backup retained.
- Backend readiness and local backup status returned ok. Frontend /register returned 200; proxied registration settings enabled.
- No shared account created, no lost data reconstructed, no commit or push. Backups run only while backend runs; key escrow and offsite copies remain the operator's responsibility.
