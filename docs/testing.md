# Testing

Milestone 14 test commands:

```text
npm --prefix web run test -- --run
go -C api test ./...
make test-coverage
make test-integration
```

Integration tests require `DATABASE_URL` and a migrated PostgreSQL/PostGIS database. They cover spatial queries, migration-created indexes, rollback behavior, availability expansion, and location authorization. Unit suites cover availability, skill/range rules, matchmaking hard filters/scoring, attendance classification, notification timing, API errors, loading/empty/error states, and offline presentation.

Manual mobile matrix remains required: Android Chrome, iPhone Safari, installed Android PWA, iPhone Home Screen PWA, and desktop Chromium. Verify auth redirects, map/time input, install/push permission, sharing, calendar download, and external map opening.

Playwright/job suites are not enabled yet: repository currently has no Playwright dependency, proposal HTTP flow, or worker job implementation to exercise. Do not report those scenarios as passing until those product surfaces exist.
