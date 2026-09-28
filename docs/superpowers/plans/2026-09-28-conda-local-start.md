# Conda Local Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a new contributor run SeekCost locally with Conda and an ignored, private SQLite database without changing the production PostgreSQL path.

**Architecture:** A Conda environment installs the backend's existing dependency set plus SQLite's async driver. A root-level local runner always selects a dedicated ignored SQLite file, initializes its schema, installs frontend packages when absent, and starts both development servers. Optional demo seeding stays an explicit separate command after registering an ordinary account.

**Tech Stack:** Conda, Python 3.11, FastAPI, SQLAlchemy/aiosqlite, Next.js 16, Node.js 20+.

## Global Constraints

- Never copy or track `backend/data/seekcost.db`; local mode uses `backend/data/seekcost-local.db`.
- Never overwrite `backend/.env` or production configuration; process environment variables select local SQLite.
- Do not auto-create a public-password account or seed demo data on startup.
- PostgreSQL Docker Compose behavior remains unchanged.
- SQLite uses the application's schema bootstrap; PostgreSQL continues using Alembic.

---

### Task 1: Conda dependencies and SQLite bootstrap

**Files:**
- Create: `environment.yml`
- Modify: `backend/requirements.txt`
- Create: `backend/app/core/sqlite_schema.py`
- Modify: `backend/app/main.py`
- Test: `backend/tests/test_local_sqlite_schema.py`

**Interfaces:**
- Consumes: `Base.metadata`, `ensure_alert_scope_schema`, existing `investment_tools.icon_url` compatibility fix.
- Produces: `async def ensure_sqlite_schema(engine)` for the local runner and FastAPI lifespan.

- [x] **Step 1: Add a failing test**

The test creates a fresh temporary SQLite engine, calls `ensure_sqlite_schema`, then asserts `watch_stocks`, `users` and `investment_tools.icon_url` exist and a second call succeeds.

- [x] **Step 2: Implement the shared bootstrap**

Move the SQLite-only `create_all` and bounded compatibility fixes from `app.main.lifespan` into `app.core.sqlite_schema.ensure_sqlite_schema`.

- [x] **Step 3: Add Conda manifest and async SQLite dependency**

Set `name: seekcost-local`, Python 3.11, pip, and the backend requirements file; add `aiosqlite>=0.20.0,<1` to runtime requirements.

- [x] **Step 4: Run focused backend tests**

Run `backend/.venv/bin/python -m pytest backend/tests/test_local_sqlite_schema.py -q` with the backend on `PYTHONPATH`.

### Task 2: Safe local runner

**Files:**
- Create: `scripts/local_dev.py`
- Test: `backend/tests/test_local_dev_runner.py`

**Interfaces:**
- Consumes: `ensure_sqlite_schema`, `frontend/package-lock.json` and `frontend/node_modules`.
- Produces: `python scripts/local_dev.py` to initialize and run both servers; `python scripts/local_dev.py --init-only` to initialize without starting servers.

- [x] **Step 1: Test dedicated path and secret behavior**

The test verifies environment construction points only at `seekcost-local.db`, creates a persistent private secret, and does not edit `backend/.env`.

- [x] **Step 2: Implement preflight, initialization and process lifecycle**

Check Node.js/npm availability, initialize schema, run `npm ci` only when Next.js is missing, launch backend on 8001 and frontend on 3000, and stop both on Ctrl+C.

- [x] **Step 3: Run focused runner tests and init smoke**

Run the focused test, then invoke `--init-only` against an isolated temporary project-data path and verify a fresh SQLite database can be queried.

### Task 3: Documentation and release verification

**Files:**
- Modify: `README.md`
- Modify: `README_CN.md`
- Modify: `frontend/README.md`

**Interfaces:**
- Consumes: runner CLI and demo seeder behavior.
- Produces: bilingual local quick-start with optional demo seed instructions and clear production boundaries.

- [x] **Step 1: Document Conda quick start**

Show `conda env create -f environment.yml`, `conda activate seekcost-local`, `python scripts/local_dev.py`, and first-run registration.

- [x] **Step 2: Document optional demo seed and data location**

Explain that the user must first register a `demo` account with a unique 8+ character password before `python -m app.core.demo_data --confirm-demo`; no demo data is loaded automatically.

- [x] **Step 3: Verify and inspect**

Run focused tests, `git diff --check`, and inspect tracked paths to confirm the SQLite database and secret are ignored.
