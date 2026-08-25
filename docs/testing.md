# Testing

## Commands

```text
npm --prefix web run test
npm --prefix web run lint
npm --prefix web run typecheck
go -C api test ./...
make test-coverage
make test-integration
make test-e2e
```

`make test-e2e` resets the dedicated `borajogar_e2e` database, applies migrations, loads the repeatable seed, and runs Playwright against the real Go API and Vite app. Install the browser once with:

```powershell
npm --prefix web exec playwright install chromium
```

Playwright specs live in `web/e2e`, with one route-focused spec per app screen. The suite runs against desktop Chromium and mobile Chromium. Core journeys use real API/DB state: account creation and onboarding, location and availability management, game creation, joining, waitlists, multi-user chat, notifications, profile/safety actions, attendance, and calendar views.

Mutation tests create unique users, locations, and games. Seed records remain read-only where possible, so tests do not depend on file order or prior test state. Multi-user tests use separate browser contexts and close them after each scenario.

Integration tests require `DATABASE_URL` and a migrated PostgreSQL/PostGIS database. They cover spatial queries, migration-created indexes, rollback behavior, availability expansion, and location authorization. Unit suites cover availability, skill/range rules, matchmaking hard filters/scoring, attendance classification, notification timing, API errors, loading/empty/error states, and offline presentation.

Manual mobile matrix remains required: Android Chrome, iPhone Safari, installed Android PWA, iPhone Home Screen PWA, and desktop Chromium. Verify auth redirects, map/time input, install/push permission, sharing, calendar download, and external map opening.

Proposal acceptance remains out of scope for E2E until the proposal API and response UI exist. The current proposal placeholder screen is covered.
