# Screenshot provenance

These PNGs show the actual SeekCost interface rendered by Playwright with deterministic, fictional API fixtures from `frontend/e2e/readme-screenshots.spec.ts`.

- No real login, database writes, holdings, brokerage exports, or private research.
- All `/api/**` calls are intercepted. Symbols are public identifiers; prices, rules and research text are invented, not investment advice or historical quotes.
- Desktop: 1440 × 1000 CSS pixels, English. Phone: 390 × 844 CSS pixels at 2× scale, Simplified Chinese. Chromium; not a claim of physical iOS device verification.
- Regenerate with the frontend running: `cd frontend && npx playwright test e2e/readme-screenshots.spec.ts`.
- Inspect every image before publication. The fixtures are code; changes to them must not introduce private data.
