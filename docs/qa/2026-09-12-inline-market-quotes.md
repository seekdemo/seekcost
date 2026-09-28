# Inline market quotes — 2026-09-12

Implemented the supplied mini intraday chart / latest price / signed daily percentage reference in all watchlist funnel stages, industry/concept cards, price-space view and quick decision drawer. Price-space calculations and sorting use the same fetched price in client memory; viewing does not write quotes to the database. Historical strategy evidence and daily K-line charts remain their own distinct data, not relabeled intraday data.

## Data and performance

- Authenticated `/api/v1/prices/intraday-quote` reads Yahoo regular-session 5-minute samples, with query1/query2 fallback.
- Latest exchange-local session only, actual provider previous close, finite positive samples, no invented price/change/line.
- Four concurrent provider calls, at most 64 queued keys, duplicate coalescing, 512 cache entries; success TTL 60 seconds, failure TTL 20 seconds.
- Browser IntersectionObserver loads visible rows, refreshes each minute while visible, and suspends refreshes in hidden tabs. Unmounted components remove timers/listeners.
- Missing provider data shows saved price explicitly and unknown change. Metadata marks the source as non-real-time and shows timestamp in the browser's local timezone. These are not Futu licensed live quotes, ticks or order-book data.
- Quote colors are red up / green down; light theme uses darker variants. Unreviewed research no longer dims newly fetched quotes.

## Verification

- Backend: 12 passed across `test_market_quote.py`, `test_watchlist_quote.py`, `test_market_history.py` (normalization, null baseline, invalid values, session filtering, coalescing/cache, provider failure, auth, existing quote/history regression).
- Frontend: 6 Playwright tests passed across desktop 1440, tablet 834 and mobile 390, plus price-space at 320 pixels. Tests use explicit fixtures for up/down/unavailable and actual demo login for provider screenshots.
- TypeScript and the final production Webpack build passed, including client quote synchronization.
- Screenshots manually inspected for desktop/tablet list, mobile list, industry card and 320px price-space. No page-wide horizontal overflow in tested views. Browser emulation, not physical-device testing.

Screenshots are under `frontend/test-results/inline-market-quotes-live-demo-quote-screenshot-{desktop,tablet,mobile}/`: `live-quotes.png`, `industry-quotes.png`, `price-space-quotes.png`. They are transient test artifacts, overwritten by subsequent test runs.

Local service remains at http://localhost:3000/watchlist. No dependency installations, database mutations, commits or deployment were performed.
