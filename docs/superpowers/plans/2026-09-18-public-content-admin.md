# Public Content Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Explain SeekCost's motivation and roadmap on About and let authorized administrators edit, preview and publish that public content.

**Architecture:** Separate administrator membership from personal profiles. Store versioned bilingual About drafts and published snapshots; public reads never expose drafts. Keep existing privacy disclosures and guide links. This first slice manages About, not users' private investment data.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Next.js, existing session authentication.

## Global Constraints

- Preserve the dirty worktree and user data; no automatic commits.
- Do not elevate the demo or first registered user. Require an explicitly named account for provisioning.
- Recheck database membership on every privileged request. No role fields accepted via profile/registration.
- Plain-text structured sections only; no executable HTML. Draft save and publication are separate, version-checked actions.
- Execute inline with checkpoints; executing-plans is unavailable in this session.

### Task 1: Content and authorization backend

Files: `backend/app/models/site_content.py`, `backend/app/core/site_content.py`, `backend/app/api/v1/site_content.py`, `backend/alembic/versions/a7c1d3e6f9b2_site_content.py`, `backend/tests/test_site_content.py`.

- [x] Add isolated API tests: `assert public.json()['content']['title']; assert (await ordinary.put('/api/v1/admin/content/about', json=body)).status_code == 403`. Verify draft invisibility, version conflict 409, publication and audit history.
- [x] Create `SiteAdmin(user_id)`, `SiteContent(key, locale, draft, published, version, published_at)` and `ContentAudit(actor_id, action, key, locale, version, created_at)` tables. Introduce plain text `ContentBody(title, intro, mission, values, roadmap)` with bounded nonempty fields.
- [x] Add public GET `/content/about?locale=zh-CN|en`, admin GET/PUT `/admin/content/about`, POST `/admin/content/about/publish`, GET `/admin/content/audit`, GET `/admin/me`. Claim writes with `UPDATE ... WHERE version=:expected`; return 409 on conflicts. Publish saved draft and append audit atomically.
- [x] Provide explicit local operator CLI `python -m app.core.site_admin grant USERNAME` and `revoke USERNAME`, fail for unknown users. Grant only after the user identifies the account.
- [x] Add additive Alembic tables and register models for local SQLite create_all; run `.venv/bin/pytest tests/test_site_content.py -q`.

### Task 2: About and administrative UI

Files: `frontend/src/components/AboutStory.tsx`, `frontend/src/app/about/AboutContent.tsx`, `frontend/src/app/admin/page.tsx`, `frontend/src/lib/siteContent.ts`, `frontend/src/lib/api.ts`, `frontend/src/components/ProductInfoNav.tsx`, `frontend/e2e/site-content.spec.ts`.

- [x] Add content types and API wrappers; render motivation, value and planned improvements with React text nodes, preserving existing About disclosures. Public errors show a retry rather than silently replacing published copy.
- [x] Add admin-only entry after server permission check. Editor includes locale tabs, fields, preview, dirty-state warnings, save draft, separate publish confirmation, version feedback and audit history. Unauthorized users see 403 guidance, not an editor.
- [x] Test public content, 403, failed save preserving input, draft/publish actions and responsive layouts with mocked requests; use live anonymous reads to verify actual About, without publishing test content.
- [x] Run TypeScript and production build; document operator setup and scope. Capture and inspect desktop/mobile previews where available.

## Verification outcome (2026-09-19)

- Backend: 22 passed (site_content, custom_alerts, demo_cleanup).
- Frontend: 22 passed, 2 intentionally skipped duplicate Guide routing checks on tablet/mobile.
- TypeScript and production Webpack build passed. Desktop/mobile admin editor and preview screenshots inspected.
- Live public About API verified. Real database has zero administrator memberships, zero saved drafts and zero test audit rows; initial editorial copy is served as the default.
- Account provisioning intentionally remains pending the owner's explicit username choice. The CLI and revocation were tested only in isolated databases.
