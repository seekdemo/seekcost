# Self-hosted Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Package SeekCost for private self-hosting with recoverable data and an illustrated MIT-licensed introduction.

**Architecture:** Compose runs PostgreSQL 17, a one-shot migration, one API worker, a standalone Next server, and an encrypted Restic backup service. Public registration is disabled in this deployment; an interactive server CLI creates the owner. Restore writes only to a new recovery database, never overwriting the live database.

**Tech Stack:** Docker Compose, Python/FastAPI, Next.js, PostgreSQL, Restic, Bash, Pytest, Playwright.

## Global Constraints

- Preserve existing data and Git history. No publication, automatic commit, or history rewrite.
- MIT was explicitly selected by the user. No real account or investment data in screenshots.
- No Docker runtime is installed locally: report container integration as unverified unless a runtime becomes available.
- Execute inline (executing-plans is unavailable); no delegation needed.

### Task 1: Private deployment and initialization

Files: compose.yaml; backend/Dockerfile; frontend/Dockerfile; both .dockerignore files; frontend/next.config.ts; scripts/selfhost-init.py; backend/app/core/config.py; backend/app/core/owner.py; backend/app/api/v1/auth.py; frontend/src/app/register/page.tsx; backend/tests/test_selfhost.py.

- [x] Test production secret rejection and disabled registration (POST returns 403 without inserting users), and owner creation using an isolated SQLite database.
- [x] Implement `ALLOW_REGISTRATION: bool = True`, `GET /auth/registration`, and explicit rejection at the start of registration. Compose overrides registration to false.
- [x] Implement `python -m app.core.owner USERNAME`, prompting twice with getpass, validating with RegisterBody, creating one user and SiteAdmin in one transaction; refuse existing usernames and non-interactive passwords.
- [x] Compose exposes only `127.0.0.1:3000`; DB health gates migration and successful migration gates backend; frontend uses `API_BASE_URL=http://backend:8001` at build time. Run one Uvicorn worker without reload.
- [x] Initializer uses secrets.token_hex(32), exclusive creation, mode 0600 and a private deploy/secrets directory. Never overwrite .env or existing backup keys. Verify with temporary directories.

### Task 2: Backup, recovery and deployment documentation

Files: deploy/backup/Dockerfile; deploy/backup/backup.sh; deploy/backup/restore.sh; deploy/backup/health.sh; deploy/selfhost.env.example; deploy/Caddyfile; DEPLOY.md; docs/BACKUP.md; backend/tests/test_backup_scripts.py.

- [x] Implement encrypted streaming backup: `pg_dump --format=custom --no-owner --no-acl | restic backup --stdin --stdin-filename seekcost.dump`. Use pipefail; failed dumps never become successful backup status.
- [x] Optional offsite `restic copy --from-repo /backups`; no automatic pruning/deletion. Mark health failed on dump/copy failure; optional HTTPS JSON webhook with status only, no user data.
- [x] Restore accepts a snapshot ID and a new name matching `seekcost_restore_[a-z0-9_]+`; `createdb` must succeed before streaming into `pg_restore --exit-on-error --no-owner --no-acl`. Never drop/recreate the source database. Keep failed recovery databases for inspection.
- [x] Add tests with stub binaries covering backup failure propagation, remote failure, healthy status, refusal of unsafe/live restore names, and existing database refusal. Clearly distinguish these from real recovery testing.
- [x] Document first deployment, explicit owner creation, backup key escrow, daily RPO limits, optional offsite storage, manual restore drills, safe upgrades, existing SQLite data boundaries, and required Docker-host acceptance checks.

### Task 3: Open-source introduction and release checks

Files: LICENSE; README.md; README_CN.md; OPEN_SOURCE_CHECKLIST.md; docs/images/*; frontend/e2e/readme-screenshots.spec.ts.

- [x] Add MIT license attributed to SeekCost contributors. Update positioning to self-hosted personal investment workbench, with links to deployment/recovery docs and an honest feature list.
- [x] Render actual watchlist and alert UI with deterministic synthetic API fixtures in a fresh browser context. Intercept all API calls so no private data is used. Capture desktop and mobile PNGs for README.
- [x] Verify only paths/commit IDs for historical broker exports; do not read private records or rewrite history. Record public-release blocker.
- [x] Run focused backend tests, shell syntax and config tests, TypeScript, production build and screenshot tests. Inspect all published screenshots; document limits rather than claim full deployment verification.

## Verification and remaining release gates

- 34 focused backend tests passed; includes backup control flow using stub clients, not a real database recovery drill.
- 23 Playwright tests passed; one deliberate tablet screenshot skip. Desktop/mobile images inspected; all API fixtures are fictional.
- TypeScript, focused ESLint, Next production webpack build, Bash syntax, YAML parsing and git diff whitespace checks passed.
- Initial browser rerun failed because localhost was not listening; after restarting the frontend, one ambiguous alert locator was corrected and the complete selected suite passed.
- [ ] Run Docker Compose smoke/recovery workflow on a Docker host (Docker is absent here).
- [ ] Perform Git history privacy cleanup in a separate release copy before publishing; no history rewrite or push was performed.
- [ ] Run dependency/image security audit and target-host HTTPS/network/restore acceptance before production use.
