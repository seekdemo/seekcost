# Tool icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans inline; unavailable here, follow steps directly.

**Goal:** Automatic favicon preview and directory display with manual override and fallback.
**Architecture:** Authenticated discovery endpoint returns bounded raster data URLs. Pin public DNS addresses for every HTTP hop, enforce timeout/size limits, cache results. Store optional manual image URL; null means automatic. Reuse one frontend icon component for cards and form.
**Tech Stack:** FastAPI/httpx, Alembic, React, Pytest, Playwright.

## Constraints
- No third-party favicon service, no cookies or credentials forwarded, no private addresses or nonstandard ports; bounded redirects and concurrency.
- Icons never block saving; URL changes cancel stale UI updates; manual overrides remain intact.
- Back up before schema migration; preserve existing data; no commit requested.

## Steps

Completed 2026-09-23: 11 backend tests, 3 browser viewport workflows, TypeScript,
targeted ESLint and diff checks pass. Real python.org icon fetched successfully;
localhost refused. Local SQLite has no Alembic baseline (upgrade correctly refused
existing tables); added idempotent startup column compatibility instead of stamping
unknown migration history. Formal Alembic migration remains for managed deployments.
Pre-change encrypted backup: seekcost-20260923T004756Z-8e0730dc42c9497e950c5821c555f6d3.sql.fernet.

Limits: 4 concurrent upstream fetches, 8-second total deadline, 3-second network
timeout, 256 KiB response cap, 4 hops, 128 cache entries; positive TTL 1 hour,
negative TTL 5 minutes. Raster signatures only; SVG-only sites use initials.
No external provider, no direct remote image loads in browser. Manual URLs are
persisted and fetched through the same policy. Existing rows stay null/automatic.
- [ ] Backend `app/core/tool_icons.py`: implement `discover_icon(url)` and pinned public-IP fetching; test private-IP refusal, HTML parsing, fallback and raster-only data.
- [ ] Add nullable `icon_url` to model/schema/types, migration after b9c2d4e6f801. Add authenticated `/tools/icon` response `{icon: string|null}`; manual source uses same guarded fetch, never direct browser requests.
- [ ] Shared `ToolIcon` requests authenticated icon endpoint, caches/inflight deduplicates, shows initials immediately; form custom URL/reset and debounced automatic preview.
- [ ] Run backend tests, TypeScript and desktop/mobile tests; encrypted backup, migrate/restart and verify live route.
