# SeekCost

[English](README.md) | [简体中文](README_CN.md)

**Your research. Your decisions. Your data.**

SeekCost is an MIT-licensed, self-hosted personal investment workbench. Run it on your own server and keep watchlists, research, price observations, alerts, and decision records together—without handing your investment history to a hosted platform.

[Self-hosting](docs/SELF_HOSTING.md) · [Backup & recovery](docs/BACKUP.md) · [Security](SECURITY.md) · [MIT license](LICENSE)

![SeekCost watchlist with intraday trends and price changes — synthetic demo data](docs/images/watchlist-desktop.png)

> Screenshots show the real application with fictional API fixtures, not real holdings or live market quotes. The project is actively evolving. Container deployment and disaster recovery must be verified on your own test host before storing your only copy of important data.

It is organized around one explicit feedback loop:

**Investment catalog → decision and budget → execution → outcome review → strategy iteration**

The catalog can include stocks, ETFs, deposits, gold, real estate, courses, GPT or software subscriptions, and custom capability-building expenses. SeekCost does not try to replace a market-data terminal, property system, or brokerage app. It has no public feed, follower graph, popularity ranking, or automatic publishing. Investment, decision, and transaction data remain private to the current user.

## Self-host in a few steps

With Docker Compose v2 and Python 3 installed, run from the repository root:

```bash
python3 scripts/selfhost-init.py
docker compose config --quiet
docker compose up -d --build
# After the backend becomes healthy; password is entered interactively:
docker compose exec backend python -m app.core.owner myowner
```

Open `http://localhost:3000`. Remote installs can use an SSH tunnel or an HTTPS reverse proxy. Production deployments do not automatically create a demo account; public signup is disabled. Configuration secrets are generated locally and never printed.

**Before adding important data:** store `deploy/secrets/backup-password` off-server and perform a [restore drill](docs/BACKUP.md). Automatic backups are encrypted, but local-only unless you configure offsite replication. Never use `docker compose down -v` to upgrade—it removes the database volume.

See the [complete deployment guide](docs/SELF_HOSTING.md) for HTTPS, first-run setup, upgrades and limitations. Existing SQLite data needs a separate migration; it is not imported automatically. A clean Docker/PostgreSQL smoke workflow is provided, but was not run in the local development environment.

## Demo account

The current local development instance has this ordinary account, available at `http://localhost:3000/login`:

| Field | Value |
| --- | --- |
| Username | `demo` |
| Password | `demo123` |
| Permissions | Ordinary user, no administrator access |

This is an **intentionally public demo password**, only for isolated trial environments. Other visitors sharing the account can view, change or delete its records and change its password. Never import real holdings, brokerage statements or private research. The local demo watchlist now contains 346 user-authorized Futu entries (215 US and 131 mainland China securities), with seven thematic groups. Assets and trades remain labeled fictional examples. Imported lists do not supply fundamental conclusions, valuations or live quotes. Source CSVs and databases are not distributed with the code.

To replace fictional watchlist fixtures in an isolated demo, back up first, then run `python -m app.core.demo_watchlist_import /path/to/list.csv` from `backend` to preview; add `--apply` after reviewing. Multiple sources merge symbols and classifications; later files take precedence for names. Existing research drafts or non-fixture content block replacement. Old linked example notes are archived, while synthetic assets and trades remain unchanged.

To populate an existing ordinary `demo` account in an isolated database, back up the database first, then run:

```sh
cd backend
.venv/bin/python -m app.core.demo_data --confirm-demo
# Docker alternative (run from the repository root):
# docker compose exec backend python -m app.core.demo_data --confirm-demo
```

Includes 8 candidates, 5 investments, 6 transactions, 6 private notes, 3 trade plans, 3 paused alerts, 2 synthetic notifications and fictional calendar events. Prices, trades and research are examples, not investment advice; independently fetched quotes and K-lines remain external market data. Alerts are paused to avoid accidental monitoring. The command never creates accounts, changes passwords or grants administrator access. Repeats are a no-op after a successful seed; conflicting fixture records abort without overwriting them. No data is seeded automatically on startup.

Databases are not distributed with the source, so fresh clones and Docker installations do not automatically contain this account. An operator must provision it separately in an isolated trial database. Ordinary registration and password changes still require at least 8 characters; this 7-character password was explicitly set by the operator for the local demo and cannot be created through the signup form. Never overwrite an existing account, grant demo administrator access, or use these credentials in an instance holding real data.

## A quick tour

### Follow businesses, not just prices

Organize candidates into radar, research and strike stages. Keep a thesis and price anchors beside intraday trends, latest prices and sortable percentage changes. Quotes include freshness/fallback states; this is not an execution terminal or a real-time data guarantee.

### Let price come to your attention range

Create multiple moving-average proximity rules for one stock or the entire watchlist. Configure the period, distance, direction and cooldown. New watchlist entries join whole-watchlist rules automatically; triggered evidence appears in the in-app notification center.

![Custom moving-average alerts for individual stocks and all watchlist entries — synthetic demo data](docs/images/alerts-desktop.png)

### Review on desktop, check changes on your phone

The same workspace adapts to smaller screens. Public About and how-to pages explain the workflow; designated administrators can edit the main About content without exposing private investment records.

<img src="docs/images/watchlist-mobile.png" width="340" alt="SeekCost mobile watchlist in Chinese — fictional demo data" />

## Investment model

SeekCost keeps three investment families visible without mixing their accounting:

- Market investments: stocks and ETFs, measured by quantity, cost, current value and P&L
- Defensive and physical assets: deposits, bond funds, gold, collectibles and real estate, measured by capital and current value
- Capabilities and tools: courses, GPT memberships, software and acquisition spend, measured by cumulative spend, review and attributed return

Capability investments do not inflate portfolio net worth and are not given stock-style P&L. IBKR reconciliation remains available as a dedicated ledger inside market investing, not as the identity of the whole product.

## What it does

- Investment workbench: surfaces only items that may change a position or decision, without turning into a news feed
- Investment overview: keeps market, physical and capability investments in one catalog with explicit accounting boundaries
- IBKR ledger: reconciles brokerage positions, costs, lots, cash, transactions, and net realized P&L as a dedicated market-investment workflow
- Decision system: organizes candidates, investment theses, invalidation conditions, trade plans, and transparent quantitative evidence
- Trade review: connects outcomes back to pre-trade reasoning and records execution gaps and strategy improvements
- Decision records: stores tags, topics, review dates, and personal annotations without content distribution
- Responsive UI: designed for desktop, tablet, and mobile
- International UI: English by default, with Simplified Chinese, Traditional Chinese, Japanese, Spanish, and French
- Private accounts: username-and-password authentication with no email-service dependency
- Custom alerts: configurable SMA proximity rules, whole-watchlist monitoring and in-app notifications
- Self-hosting kit: private signup policy, explicit owner provisioning, encrypted backup scripts and restore-to-new-database safeguards
- Public content: About and usage guide, with role-gated About drafts, publication and audit history

## Intraday preview behavior

Intraday previews are provisional warnings, not persisted trading signals. Each user’s latest preview is cached in the backend process for five minutes, while refreshes run asynchronously so the endpoint can return the last available preview immediately. The cache is process-local: deployments with multiple workers need a shared cache before relying on consistent cached previews across workers.

## Tech stack

- Frontend: Next.js 16, React 19, TypeScript, Tailwind CSS
- Backend: FastAPI, SQLAlchemy, Alembic
- Database: PostgreSQL
- Quality: Pytest, Playwright, ESLint, TypeScript

## Local development

### 1. Backend

Requires Python 3.10+ and PostgreSQL 14+.

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Set the database URL and a random secret in `backend/.env`, then run:

```bash
alembic upgrade head
uvicorn app.main:app --reload --host 127.0.0.1 --port 8001
```

Backend health check: `http://localhost:8001/health`

### 2. Frontend

Requires Node.js 20+.

```bash
cd frontend
npm ci
cp .env.example .env.local
npm run dev
```

Open `http://localhost:3000` and create a username and password on first use. English is the default interface language; the language switcher is available in the top navigation.

## Configuration

Backend configuration is provided through environment variables. Never commit real values.

| Variable | Purpose |
| --- | --- |
| `APP_ENV` | `development` or `production` |
| `SECRET_KEY` | JWT signing secret; at least 32 characters in production |
| `DATABASE_URL` | Async PostgreSQL connection URL |
| `CORS_ORIGINS` | Frontend origins allowed to call the API |
| `SQL_ECHO` | SQL logging; disabled by default |
| `ALLOW_REGISTRATION` | Local development default true; Compose defaults to false |

The frontend uses `API_BASE_URL` for the server-side API proxy. Never put secrets in `NEXT_PUBLIC_*` variables because those values are included in browser bundles.

## Verification

```bash
cd backend
pip install -r requirements-dev.txt
pytest

cd ../frontend
npm run lint
npm run build
npm run test:e2e
```

Playwright expects a test account token through `SEEKCOST_E2E_TOKEN`.

## Data and privacy

- `.env` files, databases, broker imports/exports, backups, recovery keys, and uploads are ignored by Git
- Never commit real brokerage statements, account numbers, positions, transactions, or production logs
- Complete the [open-source checklist](OPEN_SOURCE_CHECKLIST.md) before publishing the repository
- Follow the [security policy](SECURITY.md) when reporting a vulnerability
- **Release gate:** historical commits contain broker import paths. Do not publish this Git history before completing the history cleanup and audit in the checklist; ignoring current files does not remove old commits.

### Operational boundaries

This version is intended for private installations, not an open-signup SaaS. Use one backend worker: monitoring tasks and preview caches are process-local. Market-data availability depends on providers and the host network. Alerts are in-app, not guaranteed email/push delivery. Full deployment acceptance, load testing, dependency auditing and real recovery drills remain operator responsibilities.

Screenshots can be reproduced with `cd frontend && npx playwright test e2e/readme-screenshots.spec.ts` while the frontend is running. The test intercepts all API calls and never signs into a real account.

## Project structure

```text
SeekCost/
├── backend/       FastAPI, models, migrations, and backend tests
├── frontend/      Next.js application and end-to-end tests
├── README.md      English project documentation
├── README_CN.md   Simplified Chinese documentation
└── DEPLOY.md
```

## License

[MIT](LICENSE). You may use, modify and redistribute SeekCost, including commercially, under the license terms. This does not grant rights to third-party market data. SeekCost is decision-support software, not investment advice or an automated trading service.
