# 候选标的公司研究档案实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/watchlist/[id]` 从长表单改造成以公司基本面为主线、以客观量价关系为验证工具的响应式个人研究档案。

**Architecture:** 后端新增用户隔离的研究模块关系，兼容同步现有 `WatchStock` 字段；详情页通过独立 profile 接口按标的加载研究数据，使用独立的阅读/编辑模块组件。日线服务端返回透明的量价观察结果，前端只负责展示和交互，避免重复计算。

**Tech Stack:** FastAPI、SQLAlchemy 2、Alembic、Pydantic、Next.js 16 App Router、React 19、TypeScript、Tailwind CSS、Playwright、pytest/httpx。

## Global Constraints

- 详情页的核心目标是彻底理解公司，不建设资讯流、社区互动、作者、热度或公开协作。
- 基本面由用户维护，本轮不接入第三方财报供应商。
- 量价指标只描述客观市场行为并展示触发依据，不生成确定性买卖建议。
- 所有研究、证据、问题、速记和关联对象严格按 `user_id=current_user.id` 隔离。
- 后端是长期事实来源；保存失败时前端回滚服务端状态并保留未保存编辑内容。
- 不引入 BLEX 或其他外部平台桥接，历史数据正文、时间和指标不删除。
- 桌面、平板和手机页面必须无横向溢出，图表和编辑控件使用稳定尺寸。
- 保留现有登录、股票池、速记、研究库和日线接口的兼容行为，不删除旧字段。
- 除已有依赖外不新增前端组件库；复用现有 `RichTextField` 和国际化体系。

---

### Task 1: 建立研究模块数据模型和迁移

**Files:**
- Create: `backend/app/models/watchlist_research.py`
- Modify: `backend/app/models/__init__.py`
- Modify: `backend/app/schemas/watchlist.py`
- Create: `backend/alembic/versions/c2d3e4f5a6b7_add_watch_stock_research_sections.py`
- Test: `backend/tests/test_watchlist_research_sections.py`

**Interfaces:**
- Produces `WatchResearchSectionKey` values: `company_overview`, `industry_moat`, `growth_financials`, `risks_invalidation`, `valuation_decision`.
- Produces `WatchStockResearchSection` with `user_id`, `stock_id`, `key`, `summary`, `evidence`, `open_questions`, `reviewed_at`, `next_review_at`, `review_note`, `created_at`, `updated_at`.
- Produces Pydantic types `ResearchEvidenceItem`, `ResearchQuestionItem`, `WatchStockResearchSectionOut`, `WatchStockResearchSectionUpdate`, `WatchStockResearchProfileOut`.

- [ ] **Step 1: Write the failing ownership and migration-shape tests**

  In `backend/tests/test_watchlist_research_sections.py`, create an in-memory SQLite engine using the same `Base.metadata.create_all` and dependency override pattern as `test_watchlist_earnings.py`. Add two users and one stock per user. Assert the profile schema contains exactly the five section keys, an owner can create/update a section, and a second user receives `404` for the other user's stock.

  Add a migration test fixture with legacy values in `business_summary`, `growth_drivers`, `fundamental_risks`, `thesis`, `invalidation`, and `fundamental_metrics`; assert the migration creates one row per key and preserves each value in the mapped summary/evidence payload.

- [ ] **Step 2: Run the focused tests to verify they fail**

  Run:

  ```bash
  cd backend
  pytest -q tests/test_watchlist_research_sections.py
  ```

  Expected: collection or assertion failures because the model, schemas, and profile contract do not yet exist.

- [ ] **Step 3: Implement the model and typed schemas**

  Define the SQLAlchemy model in `watchlist_research.py` with a foreign key to `watch_stocks.id` and `users.id`, cascade deletion, indexes on `user_id` and `stock_id`, and a unique constraint on `(user_id, stock_id, key)`. Store evidence and questions as JSON lists with Pydantic validation at the API boundary.

  Export the model from `backend/app/models/__init__.py`. Add `research_sections` to the profile output rather than weakening existing `WatchStockOut` types.

- [ ] **Step 4: Add the Alembic migration and idempotent backfill**

  Create revision `c2d3e4f5a6b7` with `down_revision = "b1c2d3e4f5a6"`. Create the table, indexes, and unique constraint. Backfill one row for each key for every existing `watch_stocks` row. Map legacy fields as follows: `business_summary` and `entry_reason` to `company_overview`; `growth_drivers` and `fundamental_metrics` to `growth_financials`; `fundamental_risks` and `invalidation` to `risks_invalidation`; `thesis` and price anchors to `valuation_decision`; `sector`, `industries`, and `concepts` to `industry_moat`. Running upgrade twice must not create duplicates.

- [ ] **Step 5: Run tests and commit the data contract**

  Run:

  ```bash
  cd backend
  pytest -q tests/test_watchlist_research_sections.py
  alembic upgrade head
  alembic downgrade b1c2d3e4f5a6
  alembic upgrade head
  ```

  Expected: all focused tests pass; upgrade/downgrade/upgrade leaves the five section rows and legacy values intact.

  Commit:

  ```bash
  git add backend/app/models/watchlist_research.py backend/app/models/__init__.py backend/app/schemas/watchlist.py backend/alembic/versions/c2d3e4f5a6b7_add_watch_stock_research_sections.py backend/tests/test_watchlist_research_sections.py
  git commit -m "feat: add private watchlist research sections"
  ```

### Task 2: Add the private research profile API

**Files:**
- Modify: `backend/app/api/v1/watchlist.py:40-520`
- Modify: `backend/app/schemas/watchlist.py`
- Test: `backend/tests/test_watchlist_research_sections.py`

**Interfaces:**
- `GET /api/v1/watchlist/stocks/{stock_id}/research-profile` returns `WatchStockResearchProfileOut` containing the owner-scoped stock, five sections, stock memos, and linked research summaries.
- `PATCH /api/v1/watchlist/stocks/{stock_id}/research-sections/{key}` accepts `WatchStockResearchSectionUpdate` and returns `WatchStockResearchSectionOut`.
- Existing `PATCH /watchlist/stocks/{id}` remains valid and synchronizes legacy fields with the mapped section summary.

- [ ] **Step 1: Add failing endpoint tests**

  Extend the focused backend test with requests for the profile, a partial section update, a malformed question state, a missing stock, and a cross-user stock. Assert the response contains no other user's memos or linked research. Assert a legacy `PATCH` updates the corresponding section and a section `PATCH` updates the corresponding legacy field in the same transaction.

- [ ] **Step 2: Run the endpoint tests to verify failure**

  ```bash
  cd backend
  pytest -q tests/test_watchlist_research_sections.py -k "profile or section or ownership"
  ```

  Expected: `404` for the not-yet-registered profile route and missing response fields.

- [ ] **Step 3: Implement owner-scoped query helpers**

  Add `_get_user_research_section(stock_id, key, db, user)` and `_get_user_profile_stock(...)`. Both must query by `user_id` and return `404` without revealing whether another user owns the id. Join memos and notes only through current-user predicates.

- [ ] **Step 4: Implement profile and section patch routes**

  Normalize missing section rows by creating the five default rows inside the profile transaction. Validate evidence URLs as `http`/`https`, question status against `open`, `validated`, `discarded`, and enforce a maximum of 100 evidence items and 100 questions per section. Use one commit for section data and the mapped legacy field.

- [ ] **Step 5: Run backend regression and commit**

  ```bash
  cd backend
  pytest -q tests/test_watchlist_research_sections.py tests/test_watchlist_earnings.py tests/test_watchlist_classification.py
  ```

  Commit:

  ```bash
  git add backend/app/api/v1/watchlist.py backend/app/schemas/watchlist.py backend/tests/test_watchlist_research_sections.py
  git commit -m "feat: expose owner-scoped watchlist research profile"
  ```

### Task 3: Extract transparent price-volume analytics

**Files:**
- Create: `backend/app/core/price_volume.py`
- Modify: `backend/app/api/v1/prices.py:246-276`
- Create: `backend/app/schemas/prices.py`
- Test: `backend/tests/test_price_volume.py`

**Interfaces:**
- `DailyBarInput` contains `date`, `open`, `high`, `low`, `close`, and `volume`; `PriceAnchors` contains nullable `fair_price`, `strike_price`, and `target_price`.
- `build_price_volume_observation(items: list[DailyBarInput], anchors: PriceAnchors) -> PriceVolumeObservation`, where `PriceVolumeObservation` contains nullable `ma20`, `ma60`, `ma120`, `annualized_volatility`, `atr14`, `max_drawdown`, `relative_volume20`, `support60`, `resistance60`, `trend_basis`, `volume_basis`, `volatility_basis`, `drawdown_basis`, `position_basis`, and `divergence_basis`.
- `GET /api/v1/prices/price-volume?stock_id=&market=&range=` verifies the current user owns `stock_id`, reads the stock's price anchors server-side, and returns raw bars, `observation`, `data_quality`, `source`, and `as_of`.

- [ ] **Step 1: Write deterministic failing analytics tests**

  Use a fixed 130-day OHLCV fixture. Assert MA20/60/120, annualized volatility, ATR14, max drawdown, relative volume against the prior 20-day mean, rolling 60-day support/resistance, and the observation reason strings. Add fixtures for fewer than 20 bars, zero volume, and flat prices.

- [ ] **Step 2: Run the focused tests to verify failure**

  ```bash
  cd backend
  pytest -q tests/test_price_volume.py
  ```

  Expected: import failure for `build_price_volume_observation`.

- [ ] **Step 3: Implement pure, auditable calculations**

  Keep calculations independent of HTTP and provider code. Use sample standard deviation of daily close-to-close returns multiplied by `sqrt(252)`, true range averaged over 14 bars for ATR14, the prior 20 completed bars for relative volume, and the last 60 completed bars for support/resistance. Return `null` for insufficient history instead of manufacturing values. Include a `basis` string for every non-null observation.

- [ ] **Step 4: Add the authenticated price-volume route**

  Import `WatchStock`, load it with `user_id=current_user.id`, reuse `_fetch_daily_bars(stock.symbol, market, range)`, and catch provider failures without hiding the difference between an empty result and a failed provider. Keep the existing `/prices/daily-bars` response unchanged for old clients.

- [ ] **Step 5: Run tests and commit**

  ```bash
  cd backend
  pytest -q tests/test_price_volume.py tests/test_price_symbols.py
  ```

  Commit:

  ```bash
  git add backend/app/core/price_volume.py backend/app/api/v1/prices.py backend/app/schemas/prices.py backend/tests/test_price_volume.py
  git commit -m "feat: add transparent price volume observations"
  ```

### Task 4: Define frontend research contracts and API client methods

**Files:**
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/api.ts:80-220`
- Test: `frontend/e2e/watchlist-detail-research.spec.ts` API route fixtures

**Interfaces:**
- `KRange` is the union `"1mo" | "3mo" | "6mo" | "1y"`.
- `WatchResearchSectionKey`, `ResearchEvidenceItem`, `ResearchQuestionItem`, `WatchResearchSection`, `WatchResearchSectionUpdate`, `WatchlistResearchProfile`, and `PriceVolumeObservation` are complete TypeScript types; no `Record<string, unknown>` for the detail profile.
- `api.getWatchlistResearchProfile(stockId: number)` and `api.updateWatchResearchSection(stockId: number, key: WatchResearchSectionKey, data: WatchResearchSectionUpdate)`.
- `api.getPriceVolume(stockId: number, market: string, range: KRange)`.

- [ ] **Step 1: Add fixture types and failing compile references**

  Add typed mock profile and price-volume payloads to the new Playwright test, then reference the API methods from a temporary test helper so TypeScript fails until the contracts exist.

- [ ] **Step 2: Implement the types and request methods**

  Keep `RequestInit` error behavior from `frontend/src/lib/api.ts`; do not introduce a second fetch wrapper. Encode section keys with `encodeURIComponent` and pass only partial update fields.

- [ ] **Step 3: Run frontend checks**

  ```bash
  cd frontend
  ./node_modules/.bin/tsc --noEmit --incremental false
  ./node_modules/.bin/eslint src/lib/api.ts src/lib/types.ts
  ```

  Expected: both commands pass with the new types used by the test fixture.

- [ ] **Step 4: Commit the typed client boundary**

  ```bash
  git add frontend/src/lib/types.ts frontend/src/lib/api.ts frontend/e2e/watchlist-detail-research.spec.ts
  git commit -m "feat: type watchlist research profile client"
  ```

### Task 5: Build the read-only research dossier shell

**Files:**
- Create: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Create: `frontend/src/app/watchlist/detail/DecisionSummary.tsx`
- Create: `frontend/src/app/watchlist/detail/ResearchSectionCard.tsx`
- Create: `frontend/src/app/watchlist/detail/ResearchNavigation.tsx`
- Modify: `frontend/src/app/watchlist/WatchlistClient.tsx:582-1130,2186-2480`
- Modify: `frontend/src/app/watchlist/[id]/page.tsx`
- Modify: `frontend/src/app/watchlist/page.tsx`
- Modify: `frontend/src/lib/i18nFeatures.ts`

**Interfaces:**
- `WatchlistDetailView({ stockId }: { stockId: number })` owns profile loading and renders the dossier.
- `ResearchSectionCard({ section, mode, onEdit, children })` renders the common summary/empty state.
- `DecisionSummary({ profile, completeness, alerts, onSave })` renders the top decision strip.
- Route files import only the client entry; they never import another `page.tsx`.

- [ ] **Step 1: Add failing Playwright assertions for the dossier shell**

  In `frontend/e2e/watchlist-detail-research.spec.ts`, mock `GET /watchlist/stocks/115/research-profile` with one populated and four empty sections. Assert the page shows `KN · Knowles`, completeness, a next-action prompt, the five research section titles, and no legacy always-open rich-text editors.

- [ ] **Step 2: Run the new test to verify failure**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "dossier shell"
  ```

  Expected: the current page fails because it renders the old `SoulModal` form and has no profile mock contract.

- [ ] **Step 3: Implement the profile-loading shell**

  Move detail-only loading out of `WatchlistContent`. Render a stable loading skeleton, a `404` not-found state, and a profile error state with retry. Keep list loading and list actions in `WatchlistClient`.

- [ ] **Step 4: Implement summary, navigation, and read-only modules**

  Render the top summary and five `ResearchSectionCard` instances. Compute completeness from typed section fields. Empty sections render one or two contextual prompts and a single edit entry. Add English and Chinese strings for all visible labels and status messages.

- [ ] **Step 5: Run shell tests, lint, and commit**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "dossier shell"
  ./node_modules/.bin/eslint src/app/watchlist/detail src/app/watchlist/WatchlistClient.tsx 'src/app/watchlist/[id]/page.tsx'
  ```

  Commit:

  ```bash
  git add frontend/src/app/watchlist/detail frontend/src/app/watchlist/WatchlistClient.tsx frontend/src/app/watchlist/page.tsx 'frontend/src/app/watchlist/[id]/page.tsx' frontend/src/lib/i18nFeatures.ts frontend/e2e/watchlist-detail-research.spec.ts
  git commit -m "feat: add watchlist research dossier shell"
  ```

### Task 6: Add focused module editing, evidence, and review state

**Files:**
- Create: `frontend/src/app/watchlist/detail/ResearchSectionEditor.tsx`
- Create: `frontend/src/app/watchlist/detail/ResearchEvidenceList.tsx`
- Create: `frontend/src/app/watchlist/detail/ResearchQuestionList.tsx`
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/app/watchlist/detail/ResearchSectionCard.tsx`
- Test: `frontend/e2e/watchlist-detail-research.spec.ts`

**Interfaces:**
- `ResearchSectionEditor` receives a typed section and `onSave(update): Promise<void>`; it never writes directly to localStorage.
- `ResearchEvidenceList` emits `ResearchEvidenceItem[]` and validates source URL before save.
- `ResearchQuestionList` emits `ResearchQuestionItem[]` and restricts state to `open`, `validated`, or `discarded`.

- [ ] **Step 1: Add failing editor tests**

  Assert that clicking a module edit button opens only that module, rich text is editable, evidence and questions can be added, next-review date can be changed, and the save request contains only the changed section. Add a route fixture that returns `500` on save and assert the editor remains open with its content intact.

- [ ] **Step 2: Run editor tests to verify failure**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "editor"
  ```

  Expected: the old page has no section-level editor or typed save request.

- [ ] **Step 3: Implement read/edit state transitions**

  Keep one `editingSectionKey` in the detail view. Entering edit snapshots the last server version; cancel restores that snapshot. Saving calls `api.updateWatchResearchSection`, replaces only the returned section, updates completeness, and retains scroll position.

- [ ] **Step 4: Implement evidence, question, and review controls**

  Use `RichTextField` for summaries. Add keyboard-accessible list rows for evidence and questions. Validate URL scheme client-side for immediate feedback and rely on the API for final validation. Show unsaved, saving, saved, and failed states in the editor footer.

- [ ] **Step 5: Run tests and commit**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "editor"
  ./node_modules/.bin/tsc --noEmit --incremental false
  ```

  Commit:

  ```bash
  git add frontend/src/app/watchlist/detail frontend/e2e/watchlist-detail-research.spec.ts
  git commit -m "feat: add section-level company research editing"
  ```

### Task 7: Integrate objective price-volume observation and K line states

**Files:**
- Create: `frontend/src/app/watchlist/detail/PriceVolumeObservation.tsx`
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/app/watchlist/detail/DailyKSection.tsx` (extract from `WatchlistClient.tsx:2544-2810`)
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Test: `frontend/e2e/watchlist-detail-research.spec.ts`

**Interfaces:**
- `PriceVolumeObservation({ observation, status })` renders only typed observation values and their `basis` strings.
- `DailyKSection({ stock, bars, observation, range, onRangeChange, status })` has stable chart dimensions and handles loading, empty, stale, and provider-error states.

- [ ] **Step 1: Add failing price-volume UI tests**

  Mock a deterministic 130-bar response and assert the page renders basis text such as `Price above MA60 by ...`, relative volume, volatility, drawdown, and support/resistance. Add separate mocks for an empty response and a `503` response.

- [ ] **Step 2: Run the tests to verify failure**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "price-volume|K line"
  ```

  Expected: the existing client-side `QuantObservation` does not render the new response shape or basis text.

- [ ] **Step 3: Replace duplicated client calculation with the typed API response**

  Request `/prices/price-volume?stock_id=...` once per stock/range. Keep range changes cancellable with an effect cleanup. Render `data_quality` and `as_of` beside the chart. Do not turn missing values into zeroes or conclusions.

- [ ] **Step 4: Extract and harden the chart**

  Move the chart into `DailyKSection.tsx`, use a stable `min-height` and `min-width: 0`, clamp hover labels inside the chart, and keep volume visible below price. On mobile, stack metric cards after the chart and ensure the chart never enlarges document width.

- [ ] **Step 5: Run tests and commit**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "price-volume|K line"
  ./node_modules/.bin/eslint src/app/watchlist/detail src/lib/api.ts
  ```

  Commit:

  ```bash
  git add frontend/src/app/watchlist/detail frontend/src/lib/api.ts frontend/src/lib/i18nFeatures.ts frontend/e2e/watchlist-detail-research.spec.ts
  git commit -m "feat: show auditable price volume observations"
  ```

### Task 8: Complete responsive behavior, linked research, and accessibility

**Files:**
- Modify: `frontend/src/app/watchlist/detail/*.tsx`
- Modify: `frontend/src/app/globals.css`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Modify: `frontend/e2e/responsive-surfaces.spec.ts`
- Modify: `frontend/e2e/personal-investment-flow.spec.ts`

- [ ] **Step 1: Add failing responsive and accessibility assertions**

  Add desktop/tablet/mobile checks for page width, module directory visibility, 40px minimum visible controls, mobile bottom save bar, keyboard focus on module links, and return-to-watchlist navigation. Assert existing linked research and memo actions remain available.

- [ ] **Step 2: Run the checks to verify the old layout fails the new expectations**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts e2e/responsive-surfaces.spec.ts --project=mobile
  ```

  Expected: the old full form lacks the new directory, save bar, and module-level focus targets.

- [ ] **Step 3: Implement responsive layout and accessible semantics**

  Add named landmarks for summary, research navigation, fundamentals, price-volume, chart, memos, and linked research. Use `aria-current` for the active module, visible focus rings, labeled controls, and no hover-only actions. Add CSS for the three viewport tiers without changing the existing theme palette.

- [ ] **Step 4: Preserve linked research and memo behavior**

  Render existing `StockMemoPanel` and `LinkedNotesPanel` below the research modules. Keep conversion, pinning, deletion, and stable research URLs. Update only their container layout and loading props.

- [ ] **Step 5: Run responsive tests and commit**

  ```bash
  cd frontend
  npx playwright test e2e/watchlist-detail-research.spec.ts e2e/responsive-surfaces.spec.ts e2e/personal-investment-flow.spec.ts
  ```

  Commit:

  ```bash
  git add frontend/src/app/watchlist/detail frontend/src/app/globals.css frontend/src/lib/i18nFeatures.ts frontend/e2e/responsive-surfaces.spec.ts frontend/e2e/personal-investment-flow.spec.ts
  git commit -m "feat: make company research detail responsive"
  ```

### Task 9: Full verification and release handoff

**Files:**
- Test: all backend and frontend suites.

- [ ] **Step 1: Run backend migration and access-control verification**

  ```bash
  cd backend
  pytest -q
  alembic upgrade head
  ```

  Expected: all tests pass, the database is at migration revision `c2d3e4f5a6b7`, and existing stock rows retain their values.

- [ ] **Step 2: Run frontend static checks and production build**

  ```bash
  cd frontend
  ./node_modules/.bin/eslint .
  ./node_modules/.bin/tsc --noEmit --incremental false
  npm run build
  ```

- [ ] **Step 3: Run Playwright across all viewports**

  ```bash
  cd frontend
  npx playwright test
  ```

  Expected: desktop, tablet, and mobile detail workflows pass without horizontal overflow, console errors, or failed mocked requests.

- [ ] **Step 4: Perform a real-data smoke check**

  Open `http://localhost:3000/watchlist/115` with the development account. Verify the summary, empty-state prompts, current price, K line, module navigation, and one section save. Verify `/api/v1/health` remains `200` and no database rows outside the current user's stock are returned.

- [ ] **Step 5: Commit the verified implementation**

  ```bash
  git status --short
  git diff --check
  git commit -m "feat: complete company research dossier"
  ```

  The final handoff should include the migration revision, test commands and the running URLs; do not stage unrelated existing worktree changes.
