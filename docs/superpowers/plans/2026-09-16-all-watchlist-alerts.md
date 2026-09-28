# All-Watchlist Alert Scope Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One custom alert can monitor all of its owner's current and future watchlist stocks.

**Architecture:** Add `scope=single|watchlist` and nullable stock_id to rules; keep existing single-stock state intact. Global rules use a unique rule/stock evaluation-state table so entry/cooldown is independent. Scope changes re-arm state, and versioned claims reject stale work.

**Tech Stack:** Existing SQLAlchemy/FastAPI/Alembic and React/Next.js.

## Global Constraints

- All means this account's watchlist, never all-market or another user's stocks.
- Preserve existing rules, notices and cooldowns; back up local SQLite before schema changes.
- No test business data in the user's DB, no trading or external notifications.
- Execute inline; unavailable executing-plans skill replaced by these checkpoints.

### Tasks

- [ ] Model/schema/migration: nullable `stock_id`, `scope` default single, `AlertRuleState` unique `(rule_id, stock_id)`. Test migration preserves old rows and notification references.
- [ ] APIs: validate `single => stock_id required`, `watchlist => stock_id None`; global cards report total/checked/in-range/unavailable counts. Edit/delete cascades state safely without deleting notices.
- [x] Scheduler: expand watchlist targets each scan, group provider requests, claim per-target versions plus parent config version; verify two in-band stocks each notify, no repeats, additions auto-join, foreign owners excluded, pause and delete respected.
- [x] UI: single/all choice and coverage count; explain automatic inclusion and independent cooldown. All scope can be saved with an empty watchlist. Keep stock selector only for single scope.
- [x] Validate backend tests, old/new frontend tests, mobile/desktop screenshots and build. Document scope and migration.
