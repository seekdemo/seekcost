# Async Intraday Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the workbench intraday preview return immediately, reuse a five-minute per-user cache, and refresh Yahoo data in a bounded background task while the frontend polls for completion.

**Architecture:** The FastAPI process owns a small in-memory cache and one background refresh task per user. A GET returns the latest cached payload immediately; when the cache is missing or an explicit refresh is allowed, it schedules a background coroutine that evaluates at most 24 stocks with bounded concurrency. The Next.js client keeps cached rows visible, polls only while `refreshing` is true, and stops polling on completion or failure.

**Tech Stack:** FastAPI, asyncio, SQLAlchemy, Pydantic-compatible JSON dictionaries, Next.js 16, React 19, TypeScript, Pytest, Playwright.

## Global Constraints

- Preserve the current provisional-only behavior: no intraday signal snapshot is persisted.
- Keep `_INTRADAY_PREVIEW_LIMIT = 24` and the existing five-minute manual-refresh cooldown.
- Do not add Redis, Celery, a new database table, or another infrastructure dependency.
- Do not mutate unrelated dirty-worktree changes.
- A provider failure for one symbol must not fail the whole refresh.
- The cached result must remain visible while a newer refresh is running.

---

### Task 1: Background refresh state and bounded provider concurrency

**Files:**
- Create: `backend/app/core/intraday_preview_cache.py`
- Modify: `backend/app/api/v1/workbench.py:276-399`
- Test: `backend/tests/test_workbench_intraday.py`

**Interfaces:**
- Produces: `IntradayPreviewCache.get(user_id: int) -> dict | None`
- Produces: `IntradayPreviewCache.schedule(user_id: int, factory: Callable[[], Awaitable[dict]], *, force: bool = False) -> bool`
- Produces: `IntradayPreviewCache.status(user_id: int) -> dict` with `refreshing`, `cached_at`, `refresh_started_at`, and `refresh_error`
- Consumes: immutable stock and position snapshots created before the request-scoped database session closes

- [ ] **Step 1: Write failing cache tests**

```python
@pytest.mark.asyncio
async def test_intraday_cache_returns_old_value_while_one_refresh_runs():
    gate = asyncio.Event()
    cache = IntradayPreviewCache(ttl_seconds=300)
    cache.store(7, {"items": [{"stock_id": 1}]})

    async def refresh():
        await gate.wait()
        return {"items": [{"stock_id": 2}]}

    assert cache.schedule(7, refresh, force=True) is True
    assert cache.schedule(7, refresh, force=True) is False
    assert cache.get(7)["items"][0]["stock_id"] == 1
    assert cache.status(7)["refreshing"] is True
    gate.set()
    await cache.wait(7)
    assert cache.get(7)["items"][0]["stock_id"] == 2
    assert cache.status(7)["refreshing"] is False
```

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `cd backend && .venv/bin/pytest tests/test_workbench_intraday.py -q`

Expected: FAIL because `app.core.intraday_preview_cache` does not exist.

- [ ] **Step 3: Implement the in-memory cache and single-flight task manager**

```python
class IntradayPreviewCache:
    def __init__(self, ttl_seconds: int = 300):
        self.ttl_seconds = ttl_seconds
        self._entries: dict[int, CacheEntry] = {}
        self._tasks: dict[int, asyncio.Task] = {}

    def schedule(self, user_id, factory, *, force=False):
        if user_id in self._tasks and not self._tasks[user_id].done():
            return False
        if not force and self.is_fresh(user_id):
            return False
        task = asyncio.create_task(self._run(user_id, factory))
        self._tasks[user_id] = task
        return True
```

Store successful payloads with UTC timestamps, preserve the previous payload after failure, expose a short error string, consume task exceptions inside `_run`, and provide `wait()` plus `clear()` for deterministic tests.

- [ ] **Step 4: Refactor the preview worker to consume snapshots and limit concurrency**

Create plain dictionaries containing only stock and position fields used by `_intraday_preview_item`. Replace the unbounded 24-item `asyncio.gather` with a shared `asyncio.Semaphore(6)`:

```python
async def guarded(item):
    async with semaphore:
        return await _intraday_preview_item(item["stock"], item["position"])

results = await asyncio.gather(*(guarded(item) for item in selected))
```

Each selected stock still performs its intraday and daily Yahoo requests concurrently, but at most six stocks (twelve provider requests) run at once.

- [ ] **Step 5: Change the endpoint to return immediately and schedule a single refresh**

Add `refresh: bool = Query(False)`. If there is no cache, schedule a refresh. If `refresh=true`, schedule only when no task is active and the server cooldown permits it. Return cached rows or an empty shell plus:

```json
{
  "refreshing": true,
  "cached_at": null,
  "refresh_started_at": "2026-08-30T12:00:00+00:00",
  "refresh_error": null
}
```

- [ ] **Step 6: Add endpoint tests for immediate return, single-flight behavior, cooldown, and failure preservation**

Patch the refresh factory with an `asyncio.Event` so the HTTP handler can be asserted before the task finishes. Verify a second request does not start another task, a cached response is returned during refresh, and a failed refresh reports `refresh_error` without deleting cached items.

- [ ] **Step 7: Run backend tests**

Run: `cd backend && .venv/bin/pytest tests/test_workbench_intraday.py tests/test_intraday_monitor.py -q`

Expected: PASS.

### Task 2: Non-blocking frontend polling and stale-while-refresh display

**Files:**
- Modify: `frontend/src/lib/types.ts:397-407`
- Modify: `frontend/src/lib/api.ts:354-355`
- Modify: `frontend/src/app/page.tsx:27-59`
- Modify: `frontend/src/app/workbench/IntradayPreview.tsx:61-121`
- Modify: `frontend/src/lib/i18nWorkbench.ts`
- Test: `frontend/e2e/personal-investment-flow.spec.ts`

**Interfaces:**
- Consumes: `GET /api/v1/workbench/intraday-preview?refresh=true|false`
- Consumes: response fields `refreshing: boolean`, `cached_at: string | null`, `refresh_started_at: string | null`, and `refresh_error: string | null`
- Produces: polling that stops when `refreshing` is false, the component unmounts, or a 30-second client deadline is reached

- [ ] **Step 1: Extend the TypeScript response contract**

```typescript
export interface IntradayPreview {
  generated_at: string | null;
  is_market_open: boolean;
  items: IntradayPreviewItem[];
  provider_errors: number;
  requested_count: number;
  total_count: number;
  refreshing: boolean;
  cached_at: string | null;
  refresh_started_at: string | null;
  refresh_error: string | null;
}
```

- [ ] **Step 2: Add explicit refresh intent to the API client**

```typescript
getWorkbenchIntradayPreview: (refresh = false) =>
  request<IntradayPreview>(`/workbench/intraday-preview${refresh ? "?refresh=true" : ""}`),
```

- [ ] **Step 3: Replace promise-wide loading with initial loading and background refreshing**

On mount, fetch once without `refresh=true`. When the response says `refreshing`, poll every two seconds. Keep `intraday` assigned on every response so cached rows remain visible. The manual button calls `refresh=true`; polling calls the default endpoint. Track and clear the timer in the effect cleanup.

- [ ] **Step 4: Update the preview presentation**

Show skeletons only when there are no cached items. When rows exist and `refreshing` is true, keep rows rendered and change only the action label/status dot to “Refreshing…”. Surface `refresh_error` as a quiet warning and allow another manual attempt after cooldown.

- [ ] **Step 5: Write an end-to-end polling test**

```typescript
let calls = 0;
await page.route("**/api/v1/workbench/intraday-preview*", route => {
  calls += 1;
  return route.fulfill({ json: calls === 1
    ? { ...preview, refreshing: true, items: [] }
    : { ...preview, refreshing: false, items: [previewItem] }
  });
});
await page.goto("/");
await expect(page.getByText("Refreshing…", { exact: true })).toBeVisible();
await expect(page.getByText(previewItem.symbol, { exact: true })).toBeVisible();
await expect.poll(() => calls).toBeGreaterThan(1);
```

- [ ] **Step 6: Run frontend checks**

Run: `cd frontend && npm run lint`

Run: `cd frontend && npx playwright test e2e/personal-investment-flow.spec.ts --project=desktop`

Expected: PASS.

### Task 3: Integration verification and operational guardrails

**Files:**
- Modify: `README_CN.md`
- Modify: `README.md`
- Test: `backend/tests/test_workbench_intraday.py`

**Interfaces:**
- Consumes: completed backend cache and frontend polling behavior from Tasks 1–2
- Produces: documented single-process cache limitation and measured non-blocking response behavior

- [ ] **Step 1: Document the runtime behavior**

State that intraday previews are provisional, cached in process for five minutes, and refreshed asynchronously. Note that multi-worker deployments need a shared cache before relying on cross-worker cache consistency.

- [ ] **Step 2: Run the complete focused verification**

Run: `cd backend && .venv/bin/pytest tests/test_workbench_intraday.py tests/test_intraday_monitor.py tests/test_workbench_quant.py -q`

Run: `cd frontend && npm run lint && npm run build`

Expected: all commands PASS.

- [ ] **Step 3: Measure the live endpoint**

Call the authenticated endpoint once with `refresh=true` and confirm the HTTP response returns in under one second with `refreshing=true`. Poll the default endpoint until `refreshing=false`, then confirm the subsequent cached response returns in under one second and contains preview items.

- [ ] **Step 4: Review the final diff**

Confirm only the files listed above changed, existing user work remains intact, provider exceptions do not escape background tasks, and no token or account data appears in logs or documentation.
