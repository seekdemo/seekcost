# Self-hosted release verification

## Implemented

- Private Compose deployment: PostgreSQL 17 volume, non-superuser application role, explicit migration gate, one API worker, standalone frontend, loopback-only host exposure.
- Random local initialization with exclusive file creation and 0600 secret files. Public signup off in Compose; trusted terminal provisioning with no shared account/password.
- Encrypted streaming Restic backups, optional offsite copies, status webhook, stale/failure health checks, and explicit-snapshot restore to new databases only. No automatic retention deletion.
- MIT license, bilingual illustrated READMEs, deployment and recovery procedures, and isolated Docker smoke workflow.

## Locally verified

- `pytest tests/test_selfhost.py tests/test_backup_scripts.py tests/test_site_content.py tests/test_custom_alerts.py -q`: **34 passed**.
- Playwright README fixture/registration, public content administration and footer suites: **23 passed, 1 intentionally skipped** across desktop/tablet/mobile.
- `npx next build --webpack`: passed, standalone output generated.
- `npx tsc --noEmit`: passed.
- Focused ESLint for register page, screenshot spec and next config: passed.
- Bash syntax, YAML parser, and whitespace checks: passed.
- All three README PNGs visually inspected; fictional fixtures only. Initial browser connection failures were caused by the local frontend not running; after restarting, a test's ambiguous alert locator was fixed and suites rerun successfully.

## Not yet verified / release gates

- No Docker runtime on this development host. Images, Compose dependency behavior, full PostgreSQL migration chain and real encrypted recovery have **not** been exercised here. The provided CI workflow must run on an isolated Docker host; stub client tests are not recovery proof.
- No load test, complete dependency vulnerability audit, external webhook delivery test, S3 replication test or real target-server network/TLS acceptance.
- Git history still contains the `example_data` path in historical commits. This was checked read-only; no sensitive file contents were read and no history was rewritten or published. Follow the open-source checklist before public release.
- No automated conversion of existing SQLite databases to PostgreSQL is included. Preserve the source and handle migration as a separately verified operation.
