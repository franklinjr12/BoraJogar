# Bora Jogar

Bora Jogar is a mobile-first Progressive Web App for organizing beach volleyball games through compatible schedules, locations, and player preferences.

## Stack

- `web/`: React + TypeScript + Vite, React Router, TanStack Query, Vitest
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

Send development email:

```powershell
go -C api run ./cmd/tools/send-test-email
```

## Commands

`make dev`, `make dev-web`, `make dev-api`, `make dev-worker`, `make test`, `make test-integration`, `make lint`, `make typecheck`, `make generate`, `make migrate`, `make migrate-down`, `make db-reset`, and `make build` cover common development operations.

Use `make generate` after changing SQL. Generated sqlc output lives in `api/generated/` and must not be edited manually.

## Configuration

Copy `.env.example` to `.env`. Server startup requires `APP_PORT`, `DATABASE_URL`, and a `SESSION_SECRET` with at least 32 characters. Development service defaults are documented in `.env.example`.

## Database reset and migration rollback

`make db-reset` destroys the local Docker database volume, recreates it, and applies migrations. This is local-only destructive operation. `make migrate-down` rolls back the latest migration. Production migrations require backup and review.

## Local push gate

This is a personal project. GitHub CI is intentionally not configured. Install the repository pre-push hook once with `make install-hooks`; every push then runs `make ci-local` and is blocked when lint, typecheck, tests, or build fails.

## Project docs

- Engineering rules: `AGENTS.md`
- Full backlog: `docs/backlog.md`
- Architecture decisions: `docs/adr/`
