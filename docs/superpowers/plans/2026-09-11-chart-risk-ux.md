# Chart and Risk UX Implementation Plan

**Goal:** Make the existing daily chart easier to read and expose transparent, non-trading risk checks.

**Architecture:** Keep the SVG chart and existing price-volume endpoint. Evaluate risk independently of the display range, using at most 126 completed daily bars. No new dependencies or database writes.

**Tech Stack:** Next.js / React / SVG, FastAPI / Pydantic / pytest.

## Implementation and validation

- [x] Add `backend/app/core/price_risk.py` and typed response fields: current decline from 126-session closing peak (20%), ATR14/close (4%), close below previous 20-session low. These are illustrative monitoring defaults, not validated trading recommendations. Insufficient history must remain unknown.
- [x] Test empty/short history, exact threshold boundaries, invalid inputs and breakdown excluding the current bar in `backend/tests/test_price_risk.py`; run `.venv/bin/python -m pytest tests/test_price_risk.py -q`.
- [x] Attach the assessment before display filtering in `backend/app/api/v1/prices.py`; expose version, sample count and date in the response and matching TypeScript contract.
- [x] Improve `KLineChart.tsx`: right-axis ticks, grid, horizontal selected-close line, mobile vertical scrolling. Default to MA5/10/20; move optional volume details below the chart in `DailyKSection.tsx`.
- [x] Add localized risk cards below the chart with observed values, thresholds, unknown states, and scope disclaimer. Preserve source/date and stale-state warnings.
- [x] Run touched-file ESLint, TypeScript and backend tests; inspect real desktop/mobile screenshots and keyboard/range controls. Preserve existing unrelated changes; do not commit automatically.

## Verification result

14 backend tests passed (risk, price-volume, provider history). TypeScript and touched-file ESLint passed. Two live-data browser tests passed on desktop and mobile: keyboard selection, default MA visibility, responsive SVG scale, page overflow, and risk invariance across ranges. Inspected generated `chart.png` and `risk.png` in `frontend/test-results/chart-risk-ux-*/`. New labels support English and Simplified Chinese; other locales fall back to English. Existing workbench strategies were not modified in this increment.
