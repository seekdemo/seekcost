# Daily K-Line Moving Averages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the K-line's dashed price grid and add accurate, individually toggleable MA5, MA10, MA20, MA120, and MA250 overlays.

**Architecture:** The backend fetches Yahoo's `2y` history, calculates a pure aligned SMA series, and trims both candles and moving-average points to the selected display range. The frontend renders all returned candles, volume bars, and enabled averages in a responsive SVG with one synchronized pointer/keyboard interaction surface and a separate legend component.

**Tech Stack:** FastAPI, Pydantic, pytest, Next.js 16, React 19, TypeScript, Tailwind CSS, SVG, Playwright

## Global Constraints

- Update only the private watchlist company dossier and its price-volume contract.
- Keep the existing `1mo`, `3mo`, `6mo`, and `1y` controls.
- Request Yahoo's exact `2y` daily-bar range for moving-average pre-roll.
- Calculate simple moving averages from closing prices for periods `5`, `10`, `20`, `120`, and `250`.
- Return only display-range candles and aligned moving-average points.
- Preserve existing price-volume observation semantics by calculating observations from display-range bars.
- Remove all horizontal dashed grid lines and right-side grid price labels.
- Show all five moving averages by default and allow independent toggling with `aria-pressed`.
- Do not persist toggle state or add a database migration.
- Preserve loading, stale, empty, and provider-error behavior.
- Do not modify or stage unrelated dirty-worktree files.

---

### Task 1: Pure Moving-Average Series

**Files:**
- Create: `backend/app/core/moving_averages.py`
- Modify: `backend/app/schemas/prices.py`
- Create: `backend/tests/test_moving_averages.py`

**Interfaces:**
- Consumes: `DailyBarInput` from `app.schemas.prices`.
- Produces: `MovingAveragePoint(date, ma5, ma10, ma20, ma120, ma250)` and `build_moving_average_series(items: list[DailyBarInput]) -> list[MovingAveragePoint]`.
- Guarantee: output length and order equal input length and a field stays `None` until its complete lookback exists.

- [ ] **Step 1: Write failing exact-value and insufficient-history tests**

```python
from app.core.moving_averages import build_moving_average_series
from app.schemas.prices import DailyBarInput


def bars(count: int) -> list[DailyBarInput]:
    return [
        DailyBarInput(date=index, open=index + 1, high=index + 2, low=index, close=index + 1, volume=100)
        for index in range(count)
    ]


def test_moving_average_series_is_aligned_and_uses_complete_windows():
    result = build_moving_average_series(bars(260))

    assert len(result) == 260
    assert result[3].ma5 is None
    assert result[4].ma5 == 3
    assert result[9].ma10 == 5.5
    assert result[19].ma20 == 10.5
    assert result[119].ma120 == 60.5
    assert result[249].ma250 == 125.5
    assert result[-1].date == 259


def test_moving_average_series_does_not_invent_long_averages():
    result = build_moving_average_series(bars(20))

    assert result[-1].ma20 == 10.5
    assert result[-1].ma120 is None
    assert result[-1].ma250 is None
```

- [ ] **Step 2: Run the tests and verify they fail for the missing module**

Run: `cd backend && pytest -q tests/test_moving_averages.py`

Expected: collection fails with `ModuleNotFoundError: app.core.moving_averages`.

- [ ] **Step 3: Add the typed response model**

Add to `backend/app/schemas/prices.py`:

```python
class MovingAveragePoint(BaseModel):
    date: int | str
    ma5: float | None = None
    ma10: float | None = None
    ma20: float | None = None
    ma120: float | None = None
    ma250: float | None = None
```

Do not add it to `PriceVolumeResponse` until Task 2 integrates the route.

- [ ] **Step 4: Implement the rolling-sum calculator**

Create `backend/app/core/moving_averages.py`:

```python
from app.schemas.prices import DailyBarInput, MovingAveragePoint

PERIODS = (5, 10, 20, 120, 250)


def build_moving_average_series(items: list[DailyBarInput]) -> list[MovingAveragePoint]:
    closes = [float(item.close) for item in items]
    rolling = {period: 0.0 for period in PERIODS}
    rows: list[MovingAveragePoint] = []

    for index, item in enumerate(items):
        values: dict[str, float | None] = {}
        for period in PERIODS:
            rolling[period] += closes[index]
            if index >= period:
                rolling[period] -= closes[index - period]
            values[f"ma{period}"] = round(rolling[period] / period, 6) if index + 1 >= period else None
        rows.append(MovingAveragePoint(date=item.date, **values))
    return rows
```

- [ ] **Step 5: Run focused tests**

Run: `cd backend && pytest -q tests/test_moving_averages.py`

Expected: `2 passed`.

- [ ] **Step 6: Commit Task 1**

```bash
git add backend/app/core/moving_averages.py backend/app/schemas/prices.py backend/tests/test_moving_averages.py
git commit -m "feat: calculate aligned moving averages"
```

---

### Task 2: Two-Year Pre-Roll And Display-Range API

**Files:**
- Modify: `backend/app/api/v1/prices.py`
- Modify: `backend/app/schemas/prices.py`
- Modify: `backend/tests/test_price_volume.py`

**Interfaces:**
- Consumes: `build_moving_average_series(items)` from Task 1.
- Produces: `filter_display_bars(items: list[DailyBarInput], range_key: str) -> list[DailyBarInput]` and `PriceVolumeResponse.moving_averages: list[MovingAveragePoint]`.
- Guarantee: the provider call always uses `2y`; response `items` and `moving_averages` contain matching dates in the requested range.

- [ ] **Step 1: Extend the route test with a two-year call and alignment assertions**

In `backend/tests/test_price_volume.py`, replace the route's provider stub with a call-capturing function and use 520 timestamped bars:

```python
provider_ranges: list[str] = []
history = _bars(520)
for index, item in enumerate(history):
    item.date = 1_700_000_000 + index * 86_400

def fetch_history(_symbol: str, _market: str, range_key: str):
    provider_ranges.append(range_key)
    return {
        "symbol": "OWN",
        "market": "us",
        "range": range_key,
        "currency": "USD",
        "items": [item.model_dump() for item in history],
    }

monkeypatch.setattr(prices_api, "_fetch_daily_bars", fetch_history)
```

Add response assertions:

```python
body = response.json()
assert provider_ranges == ["2y"]
assert body["range"] == "6mo"
assert 100 <= len(body["items"]) <= 140
assert len(body["moving_averages"]) == len(body["items"])
assert [row["date"] for row in body["moving_averages"]] == [row["date"] for row in body["items"]]
assert body["moving_averages"][0]["ma250"] is not None
```

- [ ] **Step 2: Run the route test and verify the contract fails**

Run: `cd backend && pytest -q tests/test_price_volume.py::test_price_volume_route_is_owner_scoped_and_distinguishes_provider_failure`

Expected: FAIL because the provider receives `6mo` and the response lacks `moving_averages`.

- [ ] **Step 3: Add display-range filtering**

In `backend/app/api/v1/prices.py`, add:

```python
RANGE_DAYS = {"1mo": 31, "3mo": 93, "6mo": 186, "1y": 366}


def filter_display_bars(items: list[DailyBarInput], range_key: str) -> list[DailyBarInput]:
    if not items:
        return []
    latest = int(items[-1].date)
    cutoff = latest - RANGE_DAYS[range_key] * 86_400
    return [item for item in items if int(item.date) >= cutoff]
```

Yahoo daily-bar timestamps are integers. Keep the public query regex unchanged and add `2y` only to `_fetch_daily_bars`' internal `allowed_ranges`.

- [ ] **Step 4: Integrate history, observations, and aligned series**

Update `PriceVolumeResponse`:

```python
moving_averages: list[MovingAveragePoint] = Field(default_factory=list)
```

In `get_price_volume`:

```python
payload = await asyncio.to_thread(_fetch_daily_bars, stock.symbol, normalized_market, "2y")
history = [DailyBarInput.model_validate(item) for item in payload.get("items", [])]
history_averages = build_moving_average_series(history)
bars = filter_display_bars(history, range_key)
visible_dates = {item.date for item in bars}
moving_averages = [item for item in history_averages if item.date in visible_dates]
observation = build_price_volume_observation(bars, anchors)
```

Return `range=range_key`, `items=bars`, and `moving_averages=moving_averages`. Continue deriving `as_of` and `data_quality` from `bars`.

- [ ] **Step 5: Add pure range-filter boundary coverage**

Add to `backend/tests/test_price_volume.py`:

```python
def test_display_range_is_relative_to_latest_market_bar():
    items = _bars(400)
    for index, item in enumerate(items):
        item.date = 1_700_000_000 + index * 86_400

    visible = prices_api.filter_display_bars(items, "1mo")

    assert visible[-1].date == items[-1].date
    assert visible[0].date >= int(items[-1].date) - 31 * 86_400
    assert len(visible) == 32
```

- [ ] **Step 6: Run backend tests**

Run: `cd backend && pytest -q tests/test_moving_averages.py tests/test_price_volume.py`

Expected: all focused tests pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add backend/app/api/v1/prices.py backend/app/schemas/prices.py backend/tests/test_price_volume.py
git commit -m "feat: expose display-range moving averages"
```

---

### Task 3: Typed Responsive SVG K-Line

**Files:**
- Create: `frontend/src/app/watchlist/detail/MovingAverageLegend.tsx`
- Create: `frontend/src/app/watchlist/detail/KLineChart.tsx`
- Modify: `frontend/src/app/watchlist/detail/DailyKSection.tsx`
- Modify: `frontend/src/app/watchlist/detail/WatchlistDetailView.tsx`
- Modify: `frontend/src/lib/types.ts`
- Modify: `frontend/src/lib/i18nFeatures.ts`
- Modify: `frontend/e2e/watchlist-detail-research.spec.ts`

**Interfaces:**
- Consumes: `PriceVolumeResponse.moving_averages` from Task 2.
- Produces: `MovingAveragePeriod = 5 | 10 | 20 | 120 | 250`, `MovingAverageLegend`, and `KLineChart`.
- `KLineChart` props: `bars`, `movingAverages`, `enabledPeriods`, `activeIndex`, and `onActiveIndexChange`.
- `MovingAverageLegend` props: `activePoint`, `enabledPeriods`, and `onToggle`.

- [ ] **Step 1: Extend the typed fixture and write failing UI assertions**

Add to `PriceVolumeResponse` in `frontend/src/lib/types.ts` only after first observing the TypeScript failure:

```typescript
export interface MovingAveragePoint {
  date: number | string;
  ma5: number | null;
  ma10: number | null;
  ma20: number | null;
  ma120: number | null;
  ma250: number | null;
}
```

First extract the existing bars in `frontend/e2e/watchlist-detail-research.spec.ts` into a constant and use it for both response fields:

```typescript
const priceItems = Array.from({ length: 130 }, (_item, index) => ({
  date: 1_754_608_000 + index * 86_400,
  open: 30 + index * 0.05,
  high: 31 + index * 0.05,
  low: 29.5 + index * 0.05,
  close: 30.4 + index * 0.05,
  volume: 100_000 + index * 1_000,
}));

// Inside priceVolumeFixture:
items: priceItems,
moving_averages: priceItems.map((item, index) => ({
  date: item.date,
  ma5: index >= 4 ? item.close - 0.1 : null,
  ma10: index >= 9 ? item.close - 0.2 : null,
  ma20: index >= 19 ? item.close - 0.4 : null,
  ma120: index >= 119 ? item.close - 1.2 : null,
  ma250: 34.8 + index * 0.02,
})),
```

In the auditable K-line test add:

```typescript
for (const period of [5, 10, 20, 120, 250]) {
  await expect(page.getByRole("button", { name: new RegExp(`MA${period}`) })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId(`ma-line-${period}`)).toBeVisible();
}
await expect(page.getByTestId("kline-price-grid")).toHaveCount(0);

const ma20 = page.getByRole("button", { name: /MA20/ });
await ma20.click();
await expect(ma20).toHaveAttribute("aria-pressed", "false");
await expect(page.getByTestId("ma-line-20")).toHaveCount(0);
await expect(page.getByTestId("ma-line-5")).toBeVisible();
```

- [ ] **Step 2: Run TypeScript and Playwright to verify failures**

Run: `cd frontend && ./node_modules/.bin/tsc --noEmit --incremental false`

Expected: FAIL because `moving_averages` is not part of `PriceVolumeResponse`.

After adding the interface and field, run:

```bash
cd frontend
TOKEN=$(curl -fsS -X POST http://localhost:8001/api/v1/auth/login -H 'Content-Type: application/json' --data '{"username":"seekdemo","password":"seekdemo"}' | jq -r '.access_token')
SEEKCOST_E2E_TOKEN="$TOKEN" npx playwright test e2e/watchlist-detail-research.spec.ts --project=desktop --grep "price-volume and K line"
```

Expected: FAIL because the legend and MA paths do not exist.

- [ ] **Step 3: Add the frontend contract and legend configuration**

Extend `PriceVolumeResponse`:

```typescript
moving_averages: MovingAveragePoint[];
```

Create `MovingAverageLegend.tsx` with exported configuration:

```typescript
export type MovingAveragePeriod = 5 | 10 | 20 | 120 | 250;
export const MOVING_AVERAGES = [
  { period: 5, key: "ma5", color: "#D4A72C" },
  { period: 10, key: "ma10", color: "#4F86C6" },
  { period: 20, key: "ma20", color: "#8B72BE" },
  { period: 120, key: "ma120", color: "#B76E79" },
  { period: 250, key: "ma250", color: "#2F9C95" },
] as const;
```

Render one 40px-minimum button per item. Each button must include a swatch, `MA{period}`, the localized active value or `--`, and `aria-pressed={enabledPeriods.has(period)}`.

- [ ] **Step 4: Implement the SVG chart without a price grid**

Create `KLineChart.tsx` using a stable `viewBox="0 0 1000 360"`:

```typescript
const PRICE_TOP = 8;
const PRICE_HEIGHT = 250;
const VOLUME_TOP = 278;
const VOLUME_HEIGHT = 70;

const xFor = (index: number) => (index + 0.5) * (1000 / bars.length);
const yFor = (value: number) => PRICE_TOP + ((scaleHigh - value) / (scaleHigh - scaleLow)) * PRICE_HEIGHT;
```

Render candle wicks as `<line>` and bodies as `<rect>`, using the existing red-up/green-down convention. Render volume bars in the lower band. Do not render grid lines or right-side price labels.

Build one SVG path per enabled average. Start a new `M` segment after every `null` value so missing history creates a gap:

```typescript
function linePath(values: Array<number | null>) {
  let path = "";
  let drawing = false;
  values.forEach((value, index) => {
    if (value == null) {
      drawing = false;
      return;
    }
    path += `${drawing ? " L" : " M"} ${xFor(index)} ${yFor(value)}`;
    drawing = true;
  });
  return path.trim();
}
```

Give every path `data-testid={`ma-line-${period}`}`, `fill="none"`, `strokeWidth="1.6"`, and `vectorEffect="non-scaling-stroke"`.

- [ ] **Step 5: Add synchronized pointer and keyboard selection**

Make the SVG focusable with a localized `aria-label`. Convert pointer x-position to the nearest index:

```typescript
const selectFromClientX = (clientX: number) => {
  const rect = svgRef.current?.getBoundingClientRect();
  if (!rect) return;
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  onActiveIndexChange(Math.min(bars.length - 1, Math.floor(ratio * bars.length)));
};
```

Handle `pointerdown`, `pointermove`, and pointer capture for touch dragging. Handle `ArrowLeft`, `ArrowRight`, `Home`, and `End` in `onKeyDown`. Render a subtle solid vertical active-date marker; it is not a horizontal price grid.

- [ ] **Step 6: Wire the chart and legend into `DailyKSection`**

Replace the old `CandlestickChart` and its `bars.slice(-80)` behavior. Add state:

```typescript
const [enabledPeriods, setEnabledPeriods] = useState<Set<MovingAveragePeriod>>(
  () => new Set([5, 10, 20, 120, 250]),
);
const [activeIndex, setActiveIndex] = useState(() => Math.max(bars.length - 1, 0));
```

Clamp/reset the active index when `bars` changes. Derive the active candle and average point by aligned index. Keep the existing OHLC row, period controls, source label, failure states, date labels, and summary metrics. Pass `priceVolume.moving_averages` from `WatchlistDetailView` into `DailyKSection`.

- [ ] **Step 7: Add localized chart copy**

Add English and simplified Chinese keys to `frontend/src/lib/i18nFeatures.ts`:

```text
dossier.movingAverages = Moving averages / 均线
dossier.averageUnavailable = unavailable / 暂无数据
dossier.klineChartAria = Interactive daily K-line chart / 可交互日 K 线图
dossier.klineKeyboardHint = Use left and right arrow keys to inspect sessions / 使用左右方向键查看交易日
```

Other locales continue using the established English fallback.

- [ ] **Step 8: Run focused frontend verification**

Run:

```bash
cd frontend
./node_modules/.bin/eslint src/app/watchlist/detail src/lib/types.ts src/lib/i18nFeatures.ts e2e/watchlist-detail-research.spec.ts
./node_modules/.bin/tsc --noEmit --incremental false
TOKEN=$(curl -fsS -X POST http://localhost:8001/api/v1/auth/login -H 'Content-Type: application/json' --data '{"username":"seekdemo","password":"seekdemo"}' | jq -r '.access_token')
SEEKCOST_E2E_TOKEN="$TOKEN" npx playwright test e2e/watchlist-detail-research.spec.ts
```

Expected: lint and TypeScript pass; all dossier tests pass on desktop, tablet, and mobile.

- [ ] **Step 9: Commit Task 3**

```bash
git add frontend/src/app/watchlist/detail/MovingAverageLegend.tsx frontend/src/app/watchlist/detail/KLineChart.tsx frontend/src/app/watchlist/detail/DailyKSection.tsx frontend/src/app/watchlist/detail/WatchlistDetailView.tsx frontend/src/lib/types.ts frontend/src/lib/i18nFeatures.ts frontend/e2e/watchlist-detail-research.spec.ts
git commit -m "feat: overlay moving averages on daily K-line"
```

---

### Task 4: Interaction, Responsive, And Full Regression

**Files:**
- Modify: `frontend/e2e/watchlist-detail-research.spec.ts`
- Modify only if a failure demonstrates a defect: files changed in Tasks 1-3

**Interfaces:**
- Consumes: the completed backend response and frontend chart.
- Produces: final regression coverage and a verified implementation; no new runtime interface.

- [ ] **Step 1: Add active-date keyboard coverage**

Add to the K-line Playwright test:

```typescript
const chart = page.getByRole("img", { name: "Interactive daily K-line chart" });
await chart.focus();
const latestDate = await page.getByTestId("kline-active-date").textContent();
await chart.press("ArrowLeft");
await expect(page.getByTestId("kline-active-date")).not.toHaveText(latestDate || "");
await chart.press("End");
await expect(page.getByTestId("kline-active-date")).toHaveText(latestDate || "");
```

Use `role="img"` together with `tabIndex={0}` on the SVG. The chart's child geometry remains hidden from the accessibility tree.

- [ ] **Step 2: Strengthen responsive and selected-range assertions**

In the responsive dossier test assert:

```typescript
await expect(page.getByRole("button", { name: /MA250/ })).toBeVisible();
await expect(page.getByTestId("kline-svg")).toBeVisible();
const chartBox = await page.getByTestId("kline-svg").boundingBox();
expect(chartBox?.width || 0).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
  await page.evaluate(() => document.documentElement.clientWidth + 1),
);
```

Assert the fixture's full 130-bar selected range renders by checking `data-testid="kline-candle"` count equals `priceVolumeFixture.items.length`; this prevents reintroducing the old 80-bar truncation.

- [ ] **Step 3: Run the complete verification matrix**

Run:

```bash
cd backend
pytest -q

cd ../frontend
./node_modules/.bin/eslint .
./node_modules/.bin/tsc --noEmit --incremental false
npm run build
TOKEN=$(curl -fsS -X POST http://localhost:8001/api/v1/auth/login -H 'Content-Type: application/json' --data '{"username":"seekdemo","password":"seekdemo"}' | jq -r '.access_token')
SEEKCOST_E2E_TOKEN="$TOKEN" npx playwright test
```

Expected:

- Backend suite passes.
- ESLint and TypeScript report no errors.
- Next.js production build succeeds.
- Playwright passes on desktop, tablet, and mobile, with only explicitly inapplicable project skips.

- [ ] **Step 4: Inspect desktop and mobile screenshots**

Run the dossier test with `SEEKCOST_VISUAL_DIR=/tmp/seekcost-ma-visuals`, then inspect the desktop and mobile screenshots. Confirm:

- No horizontal dashed price grid remains.
- Five legend controls are readable without overflow.
- Candle and line colors remain distinguishable.
- MA labels and values do not cover OHLC values or range controls.
- A full 1-year chart remains legible on mobile.

- [ ] **Step 5: Commit any test-only completion changes**

If Step 1 or Step 2 changed the test after Task 3's commit:

```bash
git add frontend/e2e/watchlist-detail-research.spec.ts
git commit -m "test: cover K-line moving-average interaction"
```

If implementation fixes were required, stage only the demonstrated defect's files in the same commit. Leave every unrelated worktree change untouched.
