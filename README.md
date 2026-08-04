# Bora Jogar

Bora Jogar is a mobile-first Progressive Web App for organizing beach volleyball games through compatible schedules, locations, and player preferences.

## Stack

- `web/`: React + TypeScript + Vite, React Router, TanStack Query, Vitest, Playwright
- `api/`: Go HTTP server and worker, `pgx`, Goose migrations, sqlc
- PostgreSQL + PostGIS and Mailpit via Docker Compose

## Quick start

Requirements: Node.js, Go, Docker Desktop, and GNU Make.

```powershell
Copy-Item .env.example .env
docker compose up -d database mailpit
make migrate
make install-hooks
make dev
```

Web app: <http://localhost:5173>

API live check: <http://localhost:8080/health/live>

API readiness check: <http://localhost:8080/health/ready>

Mailpit inbox: <http://localhost:8025>

### Local phone testing with location

Phone browsers require HTTPS before they show the location permission prompt for a LAN URL. For mobile testing, create a locally trusted certificate for your computer LAN IP, set `DEV_HTTPS_KEY` and `DEV_HTTPS_CERT`, then run:

```powershell
make dev-web-mobile
```

Open `https://<LAN-IP>:5173` on the phone. Example with mkcert:

```powershell
mkcert -install
mkcert <LAN-IP>
$env:DEV_HTTPS_KEY=(Resolve-Path ".\<LAN-IP>-key.pem")
$env:DEV_HTTPS_CERT=(Resolve-Path ".\<LAN-IP>.pem")
make dev-web-mobile
```

Set `VITE_MAP_STYLE_URL` when testing a production map style. Local dev falls back to OpenStreetMap tiles when this value is empty.

Send development email:

```powershell
go -C api run ./cmd/tools/send-test-email
```

## Commands

`make dev`, `make dev-web`, `make dev-api`, `make dev-worker`, `make test`, `make test-e2e`, `make e2e-db-reset`, `make test-integration`, `make lint`, `make typecheck`, `make generate`, `make migrate`, `make migrate-down`, `make seed`, `make db-reset`, and `make build` cover common development operations.

Install Playwright browsers once after dependency installation:

```powershell
npm --prefix web exec playwright install chromium
```

After migrations, run `make seed` to load repeatable local users, profiles, venues, availability, games, invitations, and waitlists. Seed accounts use `@borajogar.local` addresses; the seed does not create real Google sessions.

For local multi-user browser testing without Google OAuth, open `/login` in separate browser profiles and create email/password accounts. To test seeded users directly after `make seed`, set the `borajogar_session` cookie to `seed-session-ana`, `seed-session-bruno`, or `seed-session-carla`.

`make test-e2e` resets `borajogar_e2e`, applies migrations, runs the shared local seed, then starts the real Go API and Vite web app. Seeded browser sessions use `borajogar_session=seed-session-ana` and `borajogar_session=seed-session-carla`.

Use `make generate` after changing SQL. Generated sqlc output lives in `api/generated/` and must not be edited manually.

## Configuration

Copy `.env.example` to `.env`. Server startup requires `APP_PORT`, `DATABASE_URL`, and a `SESSION_SECRET` with at least 32 characters. Matchmaking defaults (`MATCH_*`) control lookahead, slot generation, notice, proposal limits, and scoring windows; keep them explicit per environment.

## Database reset and migration rollback

`make db-reset` destroys the local Docker database volume, recreates it, and applies migrations. This is local-only destructive operation. `make migrate-down` rolls back the latest migration. Production migrations require backup and review.

## Local push gate

This is a personal project. GitHub CI is intentionally not configured. Install the repository pre-push hook once with `make install-hooks`; every push then runs `make ci-local` and is blocked when lint, typecheck, unit tests, Playwright tests, or build fails.

## Project docs

- Engineering rules: `AGENTS.md`
- Full backlog: `docs/backlog.md`
- Architecture decisions: `docs/adr/`
