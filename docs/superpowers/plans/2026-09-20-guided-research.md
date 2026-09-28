# Company Research Room Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox tracking.

**Goal:** Help users understand a company with optional step-by-step guidance or a self-directed workspace, preserving evidence, unknowns and personal judgments.

**Architecture:** A versioned per-user/per-stock draft stores six structured responses and the user-selected mode. Authenticated endpoints enforce ownership and optimistic concurrency. Explicit confirmation creates a private linked note snapshot without overwriting prior cards. Curated prompts are labeled as templates, never AI analysis.

**Tech Stack:** FastAPI, SQLAlchemy, Alembic, Next.js 16, React, Pytest, Playwright.

## Global Constraints

- Previous changes committed first as 6883fcd; no remote push or secrets/database in Git.
- Core is understanding the company, not classifying user ability. Modes guided/independent share one draft and switch freely.
- Allow unknown answers, skip and non-linear navigation; no recommendation or competence score.
- Evidence has title, URL, excerpt and reporting period; only HTTP(S), never server-fetch submitted URLs.
- Existing dossier material is user-recorded, not verified financial data. Do not invent trends or citations.
- Explicit saves and save-before-step-navigation; retain edits on failures/conflicts and warn on unsaved exit.
- Chinese-language first release, no external AI dependency. No automatic financial ingestion or thesis alerts yet.
- Sequential inline execution: executing-plans unavailable; tasks depend on earlier interfaces.

### Task 1: Private persistence

Files: backend/tests/test_research_guide.py; backend/app/models/research_guide.py; backend/app/api/v1/research_guides.py; backend/app/models/__init__.py; backend/app/api/v1/router.py; backend/alembic/versions/b9c2d4e6f801_guided_research.py; backend/app/core/demo_cleanup.py; backend/app/api/v1/watchlist.py.

Interfaces: GET/PUT /research-guides/{stock_id} return stock_id/version/step/mode/answers/published_version/note_id. POST /research-guides/{stock_id}/publish consumes version/confirmed. GET /research-guides lists owned drafts.

- [x] Write isolated API tests for 401, cross-user 404, GET version 0, PUT increments, stale PUT 409, invalid URL 422, empty publish 422, private snapshot, repeated publish no-op, later edit creates new snapshot. Assertions: `assert stale.status_code == 409`; `assert note.visibility.value == 'private'`; `assert first['note_id'] == repeat['note_id']`.
- [x] Run `.venv/bin/python -m pytest tests/test_research_guide.py -q` before implementation.
- [x] Model unique user_id/stock_id; six bounded answer keys; atomic update `ResearchGuide.version == body.version`, raise 409 on rowcount != 1.
- [x] Add migration, imports, cleanup before notes/stocks; keep published notes on stock deletion. Test upgrade and refusal to downgrade populated table.
- [x] Run tests again.

### Task 2: Adaptive workspace

Files: frontend/src/lib/researchGuide.ts; frontend/src/lib/api.ts; frontend/src/app/research/guide/page.tsx; frontend/src/app/research/guide/[id]/page.tsx; frontend/src/app/research/guide/GuideRoom.tsx; frontend/src/app/research/guide/GuideEvidence.tsx; frontend/src/app/research/guide/guide.module.css; frontend/src/app/notes/NotesClient.tsx; frontend/src/app/watchlist/detail/WatchlistDetailView.tsx; frontend/e2e/guided-research.spec.ts.

Interfaces: GuideDraft mirrors API; questions business/customers/financials/risks/valuation/judgment. Each answer has text/status/evidence/uncertainty. Evidence consumes current answer and existing WatchlistResearchProfile.

- [x] Browser tests: mode switching preserves answers, help/unknown, save/resume, failed saves retain text, preview/confirmation, mobile/tablet/desktop overflow.
- [x] API calls getResearchGuide/saveResearchGuide/publishResearchGuide/listResearchGuides use existing authenticated request helper.
- [x] Searchable stock picker with draft resume, loading/empty/retry states.
- [x] Shared workspace: guided one question, independent all answers in flexible order; optional explanations, explicit evidence and counterquestions, status and private card confirmation.
- [x] Add entry links in library and company detail, retain all current features.
- [x] Run `npx tsc --noEmit`, targeted ESLint, Playwright and inspect screenshots.

### Task 3: Integration

Files: docs/GUIDED_RESEARCH.md; README_CN.md.

- [x] Back up SQLite, restart backend for additive table; test isolated accounts, no test mutations to demo.
- [x] Run relevant backend regressions and frontend production build.
- [x] Document modes, manual evidence, template prompts and limitations. Record test outcomes; leave implementation reviewable and report initial commit hash.

## Verification results — 2026-09-20

- Prior work committed as 6883fcd, no push. Research-room implementation remains uncommitted for review.
- Backend: 15 tests passed across guide, cleanup, research privacy, dossier and demo fixtures. Four pre-existing datetime deprecation warnings.
- Alembic: single head b9c2d4e6f801. Additive SQLite migration and populated-table downgrade refusal tested; production PostgreSQL migration not executed locally.
- Frontend: TypeScript and targeted ESLint clean; production webpack build passed.
- Playwright: 6 tests passed across desktop/tablet/mobile, including mode persistence, edit retention on 409, unsafe links, explicit confirmation and responsive width. Screenshots in ignored frontend/test-results.
- Visual review found oversized mobile navigation; fixed to 56px with no horizontal document overflow, added a regression assertion. Independent mode keeps explanations and counterquestions collapsed.
- Backend restarted after encrypted backup seekcost-20260920T150409Z-ec8b2a8e18174bceae310f668005ba9e.sql.fernet. Health ready; actual demo authenticated picker and room render without writing research data. Save/card workflow tested against isolated SQLite, browser fixtures do not mutate demo.
- User clarification changed original novice-only scope to two freely selectable modes sharing a single company record. No inferred user ability labels.
