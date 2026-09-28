# Custom SMA Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** User-owned multiple SMA proximity rules, persistent entry-only notifications and a responsive inbox.

**Architecture:** Add isolated SQLAlchemy tables and a migration without touching legacy social notifications. A separate five-minute backend loop groups market fetches, validates freshness and completed bars, then atomically advances versioned rule state and inserts evidence snapshots. Authenticated APIs and shared navigation expose rules and unread notifications.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, existing Yahoo providers, React/Next.js, Playwright.

## Global Constraints

- Local existing project, preserve user changes and data; no external push, trading, commits or deployment.
- SMA of N completed daily closes; current quote at most 20 minutes old. Missing/stale/invalid data never resets entry state or triggers alerts.
- Initial valid in-band observation may notify; continued in-band observations do not. Re-entry during cooldown is suppressed for that entry. Rule edits/re-enabling re-arm while preserving cooldown.
- Database owner filters on all operations; atomic version compare-and-swap protects concurrent scans and edits.
- Inline execution requested; unavailable executing-plans skill replaced by the following checkpoints.

### Task 1: Persistent rules and inbox

Files: `backend/app/models/custom_alert.py`, `backend/app/api/v1/custom_alerts.py`, `backend/app/schemas/custom_alert.py`, model/router registrations and Alembic revision.

- [x] Add AlertRule fields stock_id/user_id/name/period/tolerance/side/cooldown/enabled plus inside, version, evaluation and notification timestamps. Add AlertNotification immutable JSON evidence with user_id/rule_id/read_at.
- [x] Validate period 2–250, tolerance 0.1–20%, cooldown 5–10080 minutes and ownership; `assert foreign_user_get.status_code == 404`.
- [x] Expose CRUD `/alerts/rules`, paged `/alerts/notifications`, unread count and idempotent read marking; deleting rules preserves prior notices.

### Task 2: Detection and scheduling

Files: `backend/app/core/custom_alerts.py`, lifespan registration, `backend/tests/test_custom_alerts.py`.

- [x] Implement `evaluate(rule, history, quote, now)` with signed `(price / sma - 1) * 100` and inclusive directional bands. Test exact boundaries, stale quotes, short history, invalid OHLC, initial entry, repeated entry, cooldown, exit and re-entry.
- [x] Claim updates using `UPDATE ... WHERE id=:id AND version=:old_version`; only the winner inserts notification in the same transaction. Scan grouped symbols in bounded background work, catch failures per group, preserve inside state on errors.
- [x] Five-minute loop, no frontend required. Test notification persistence and independent user inboxes using isolated SQLite.

### Task 3: User experience and verification

Files: `frontend/src/app/alerts/*`, `frontend/src/components/NotificationBell.tsx`, navigation, API/types, `frontend/e2e/custom-alerts.spec.ts`.

- [x] Create rule editor with searchable stock selection, common SMA presets plus custom period, live plain-language summary and cooldown guidance. Card actions edit/pause/delete with confirmation, empty/error/retry states.
- [x] Add unread bell and inbox with all/unread, read-all, evidence and stock link. Poll only visible signed-in sessions; failures never masquerade as an empty inbox.
- [x] Verify API tests, build and 390/834/1440px screenshots; validate CRUD with fixtures/isolated DB, never seed user's trading data. Document first-detection, sampling, service uptime and freshness limitations.
