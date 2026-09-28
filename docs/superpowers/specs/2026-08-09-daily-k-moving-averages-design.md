# Daily K-Line Moving Averages Design

## Goal

Make the company dossier's daily K-line useful for the user's preferred trend framework. Remove the horizontal dashed price grid and overlay accurate MA5, MA10, MA20, MA120, and MA250 lines. All five averages are visible by default and can be toggled independently.

## Scope

- Update the private watchlist company dossier only.
- Keep the existing 1-month, 3-month, 6-month, and 1-year range controls.
- Preserve the existing OHLC, volume, loading, stale-data, empty-data, and provider-error states.
- Do not add database tables, persist chart preferences, or introduce trading recommendations.

## Data Design

The selected display range does not contain enough history to calculate long moving averages. The backend will therefore request Yahoo's exact `2y` daily-bar range for every price-volume request, while returning only the bars inside the requested display range.

The backend will calculate simple moving averages from closing prices over the full history:

- MA5: mean of the latest 5 closes
- MA10: mean of the latest 10 closes
- MA20: mean of the latest 20 closes
- MA120: mean of the latest 120 closes
- MA250: mean of the latest 250 closes

Each average is `null` until its full lookback exists. The response will add an aligned series:

```text
moving_averages[] = {
  date,
  ma5,
  ma10,
  ma20,
  ma120,
  ma250
}
```

Only points whose dates occur in the returned display bars are exposed. Existing price-volume observations remain calculated from the selected display range so volatility, drawdown, support, resistance, and period performance retain their current meaning. Existing response fields remain compatible.

Display ranges are derived relative to the latest returned market date using fixed calendar windows: 31, 93, 186, and 366 days. This avoids using the local clock and keeps historical fixtures deterministic.

## Chart Design

The current DOM chart limits every range to the last 80 sessions. It will be replaced by one responsive SVG chart so the selected range is represented faithfully, including a full trading year.

The chart will contain:

- Candlesticks for every returned display bar.
- A volume band below the price plot.
- Five moving-average paths aligned to the same x-axis.
- No horizontal dashed grid and no right-side grid price labels.
- Only the start and end dates below the chart.

The vertical scale will include candle highs/lows and all visible moving-average values, with modest top and bottom padding so paths are not clipped. Missing average points break the relevant path instead of inventing values.

## Interaction

A compact legend sits above the plot. Each item uses a color swatch, the MA name, and the value for the active date. Clicking an item toggles that average; `aria-pressed` exposes its state. All averages reset to visible when a new page instance opens.

Colors avoid the red and green used by candlesticks:

- MA5: amber `#D4A72C`
- MA10: blue `#4F86C6`
- MA20: violet `#8B72BE`
- MA120: rose-gray `#B76E79`
- MA250: cyan `#2F9C95`

Pointer movement across the chart selects the nearest trading session. The OHLC, volume, and legend values update together. A focusable chart surface supports left and right arrow keys for keyboard users. Touch users can drag across the plot without requiring tiny candle-sized buttons.

On narrow screens the legend wraps without horizontal scrolling, and the chart keeps a stable height and width. Toggle controls retain at least a 40px touch target.

## Failure And Partial Data

- Provider failure, empty data, loading, and stale states keep their existing messages.
- If fewer than 250 sessions are available, shorter averages still render and MA250 shows an unavailable value.
- A missing average series never suppresses candlesticks or volume.
- Range changes retain the user's current toggle state for the lifetime of the mounted page.

## Contracts And Components

- Backend schema: add `MovingAveragePoint` and `PriceVolumeResponse.moving_averages`.
- Backend calculation: add a pure moving-average-series helper, separate from HTTP fetching.
- Frontend types: add the matching typed contract.
- `DailyKSection`: receive the aligned series and own toggle state.
- `CandlestickChart`: render the responsive SVG and synchronized active-date interaction.
- No database migration is required.

## Verification

Backend tests will cover exact simple-moving-average values, insufficient history, alignment with display dates, range filtering, and existing owner isolation.

Frontend tests will verify:

- No dashed grid is rendered.
- MA5, MA10, MA20, MA120, and MA250 are enabled initially.
- Toggling one average hides only that path.
- Hover, touch/pointer selection, and keyboard arrows update displayed values.
- Empty/provider-error states still work.
- Desktop, tablet, and mobile layouts have no horizontal overflow.
- ESLint, TypeScript, production build, backend tests, and the Playwright suite pass.
