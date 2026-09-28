# Investment Tool Directory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a private, searchable navigation module for collecting vibe-coded products that directly support investment research, quantitative work, automation, execution, and review.

**Architecture:** Store each user's directory entries in a dedicated `investment_tools` table exposed through user-isolated CRUD endpoints. Add `/tools` as a fourth fixed product area and render an interactive client page with server-backed search, category filters, starring, responsive cards, and an add/edit dialog. The directory remains a personal utility collection, not a public marketplace, recommendation feed, or social product.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, Pydantic 2, Next.js 16 App Router, React 19, TypeScript, Tailwind CSS, Pytest, Playwright.

## Global Constraints

- Default interface language remains English with Simplified Chinese, Traditional Chinese, Japanese, Spanish, and French support.
- Every tool record is private to `current_user.id`; cross-user reads and writes return `404` or an empty list.
- URLs accept only `http` and `https`; no server-side URL fetching is introduced.
- Do not add ratings, comments, popularity, public submissions, automatic recommendations, or external account integrations.
- Do not use localStorage as a tool data source.
- Preserve all unrelated changes in the dirty worktree and do not create a commit.

---

### Task 1: Private Tool Directory API

**Files:**
- Create: `backend/app/models/investment_tool.py`
- Create: `backend/app/schemas/investment_tool.py`
- Create: `backend/app/api/v1/investment_tools.py`
- Create: `backend/alembic/versions/d3e4f5a6b7c8_add_investment_tools.py`
- Create: `backend/tests/test_investment_tools.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/api/v1/router.py`
- Modify: `backend/app/core/demo_cleanup.py`

**Interfaces:**
- Consumes: authenticated `User` and `AsyncSession` dependencies.
- Produces: `GET/POST /api/v1/tools` and `PATCH/DELETE /api/v1/tools/{tool_id}`.

- [ ] **Step 1: Write a failing privacy and CRUD test**

Create two users, create one tool as the owner, assert the normalized URL and tag list, filter the owner's list, update its starred state, then switch users and assert an empty list plus `404` for update/delete.

- [ ] **Step 2: Run the focused backend test**

Run: `python -m pytest tests/test_investment_tools.py -q`

Expected: FAIL because the model and routes do not exist.

- [ ] **Step 3: Add the model and migration**

Define `InvestmentTool` with `id`, `user_id`, `name`, `url`, `description`, `category`, `pricing`, `tags`, `source_url`, `starred`, `created_at`, and `updated_at`. Add a unique constraint on `(user_id, url)`, a user index, and `ON DELETE CASCADE`.

- [ ] **Step 4: Add validated schemas and CRUD routes**

Use these stable values:

```python
ToolCategory = Literal["research", "data", "quant", "backtest", "automation", "execution", "journal", "other"]
ToolPricing = Literal["free", "freemium", "paid", "open_source", "unknown"]
```

Strip names/descriptions/tags, limit tags to eight unique values, reject non-HTTP(S) URLs, prevent duplicate URLs for one user, order the list by `starred DESC, updated_at DESC`, and always scope records by `user_id`.

- [ ] **Step 5: Register the router and cleanup ownership**

Import the model in `app.models`, mount the router in `api_router`, and add `investment_tools` to explicit demo-account cleanup before `users`.

- [ ] **Step 6: Run the focused backend test**

Run: `python -m pytest tests/test_investment_tools.py -q`

Expected: PASS.

---

### Task 2: Typed Frontend Contract And Product Navigation

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/navigation.ts`
- Modify: `frontend/src/components/Navbar.tsx`
- Modify: `frontend/src/lib/i18n.ts`
- Modify: `frontend/src/lib/i18nFeatures.ts`

**Interfaces:**
- Consumes: the API contract from Task 1.
- Produces: `InvestmentTool`, `InvestmentToolWrite`, and `api.list/create/update/deleteInvestmentTool` plus the `/tools` product area.

- [ ] **Step 1: Add complete TypeScript types and API methods**

Model category and pricing as string unions. Keep write payloads explicit and avoid `Record<string, unknown>`.

- [ ] **Step 2: Add the fourth fixed navigation area**

Extend `ProductArea` with `tools`, add `{ href: "/tools", labelKey: "nav.tools" }`, map `/tools` paths, render four equal mobile navigation columns, and add a toolbox icon path.

- [ ] **Step 3: Add localized interface copy**

Add `nav.tools` to all six core locale dictionaries. Add every `tools.*` page, filter, card, form, validation, loading, empty, and destructive-action label to feature dictionaries for all six locales.

---

### Task 3: Responsive Tool Navigation Page

**Files:**
- Create: `frontend/src/app/tools/page.tsx`
- Create: `frontend/src/app/tools/loading.tsx`
- Create: `frontend/e2e/investment-tools.spec.ts`
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`

**Interfaces:**
- Consumes: typed API methods, `AuthGuard`, and translated `tools.*` labels.
- Produces: the authenticated `/tools` module.

- [ ] **Step 1: Write the browser acceptance test**

Mock list/create/patch/delete endpoints. Assert the page title, category/search filtering, add flow, star update, external `target=_blank` link, edit flow, delete confirmation, four-item mobile nav, and no horizontal overflow at desktop and mobile viewports.

- [ ] **Step 2: Run the focused browser test**

Run: `npx playwright test e2e/investment-tools.spec.ts --project=desktop --project=mobile`

Expected: FAIL because `/tools` does not exist.

- [ ] **Step 3: Build the directory surface**

Render a compact page header with total/starred counts, an add action, search, category chips, and starred-only toggle. Use a responsive `1/2/3` column grid of individual tool cards; show initials, name, domain, concise description, category, pricing, tags, star, edit, delete, source link, and primary product link. Use an unframed page layout and never nest cards.

- [ ] **Step 4: Build the add/edit dialog**

Provide accessible labels, Escape and backdrop close, mobile bottom-sheet behavior, unsaved form retention after API failure, URL validation feedback, comma-separated tags, category/pricing selectors, source URL, and a checkbox for starred state.

- [ ] **Step 5: Add loading, error, and empty states**

Keep recovery actions local: retry loading, clear filters for no matches, and open the add dialog for a truly empty directory.

- [ ] **Step 6: Run browser tests**

Run: `npx playwright test e2e/investment-tools.spec.ts --project=desktop --project=mobile`

Expected: PASS.

---

### Task 4: Cross-Layer Verification

**Files:**
- Test: all files above.

**Interfaces:**
- Consumes: completed backend and frontend features.
- Produces: verified migration, types, build, and responsive behavior.

- [ ] **Step 1: Run backend coverage**

Run: `python -m pytest tests/test_investment_tools.py tests/test_demo_cleanup.py -q`

- [ ] **Step 2: Run frontend static checks**

Run: `npx eslint src/app/tools/page.tsx src/app/tools/loading.tsx src/components/Navbar.tsx src/lib/navigation.ts src/lib/types.ts src/lib/api.ts src/lib/i18n.ts src/lib/i18nFeatures.ts e2e/investment-tools.spec.ts e2e/responsive-surfaces.spec.ts`

Run: `npx next typegen && npx tsc --noEmit`

- [ ] **Step 3: Check migration upgrade and rollback**

Upgrade a temporary SQLite database to head, downgrade one revision, then upgrade again; assert the `investment_tools` table appears, disappears, and reappears without touching user data in other tables.

- [ ] **Step 4: Verify production build and browser screenshots**

Run: `npm run build`. Use system Chrome at `1440x1000` and `390x844`; confirm `/tools` has no overflow, its dialogs fit the viewport, external links are correct, and the four-item mobile navigation remains readable.

- [ ] **Step 5: Run whitespace and secret checks**

Run: `git diff --check` and inspect the scoped diff for credentials, tokens, local paths, and unrelated generated output.
