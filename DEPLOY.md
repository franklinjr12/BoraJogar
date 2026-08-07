# Bora Jogar deployment guide

Use this guide for remote testing deployments. It describes the current repository, not a containerized production platform.

## Current deployment shape

Run four pieces:

1. PostgreSQL with PostGIS.
2. Go API server, listening on `127.0.0.1:8080`.
3. Go worker, using the same database.
4. HTTPS reverse proxy serving `web/dist` and forwarding `/api/*` and `/health/*` to the API.

The API does not serve the React build. Do not expose the API directly as the public web server.

## Important current limitations

Resolve or consciously accept these before treating the deployment as production-ready:

- Email and Web Push delivery are not implemented end-to-end. `SMTP_*` and `VAPID_*` are present in `.env.example`, but the server does not load them and `EmailChannel`/`WebPushChannel` remain stubs. In-app notifications work; email/push should be considered unavailable.
- The worker currently runs session cleanup, finished-game completion, and availability expansion hourly. It does not run matchmaking generation or notification delivery.
- `DEFAULT_CITY_NAME` is not wired into the frontend. The frontend currently defaults venue queries/forms to `Curitiba`; verify this matches the test city before deploying.
- No production Dockerfile, reverse-proxy config, systemd unit, backup job, or migration binary exists in the repository. This guide supplies manual deployment examples.
- `make build` on Windows creates Windows Go binaries. Cross-compile for the remote Linux architecture before copying binaries.
- `make migrate-down` is for local rollback only. Production schema rollback needs a backup and a reviewed migration plan.

## Pre-deploy checklist

### Domain, server, and network

- [ ] Provision a Linux host or managed runtime matching target architecture (`amd64` or `arm64`). Go module requires Go `1.25`.
- [ ] Point DNS A/AAAA records at the host.
- [ ] Install TLS through Caddy, Nginx plus Certbot, or equivalent managed proxy.
- [ ] Allow inbound SSH only from trusted addresses where practical.
- [ ] Allow inbound `80/443`; keep API port `8080`, PostgreSQL `5432`, and SMTP ports private.
- [ ] Create unprivileged `borajogar` OS user. Run API and worker as this user.
- [ ] Configure automatic security updates and host time synchronization.
- [ ] Decide how releases, logs, backups, and secrets are retained.

### Database

- [ ] Provision PostgreSQL with PostGIS. Repository development image is `postgis/postgis:17-3.5`.
- [ ] Create dedicated database/user with strong password. Do not use Docker Compose defaults (`borajogar/borajogar`) remotely.
- [ ] Use TLS to managed/remote database (`sslmode=require` or stronger). Restrict database access to API/worker host.
- [ ] Configure automated backups, retention, and a tested restore procedure before real user data.
- [ ] Check disk space and connection limits. Current Go pool uses up to 10 connections per process.
- [ ] Run migrations once, from one operator/process, before starting new API release.
- [ ] Never run `api/cmd/tools/seed-local` against real/shared deployment DB.
- [ ] Run migrations against the real PostGIS database, not a plain PostgreSQL instance.

### Authentication and admin

- [ ] Set `APP_ENV=production`. This enables `Secure` session cookies.
- [ ] Set `APP_BASE_URL=https://your-domain.example`.
- [ ] Generate new `SESSION_SECRET` with at least 32 random characters. Keep stable across releases; rotation invalidates sessions.
- [ ] For Google login, register exactly `https://your-domain.example/api/v1/auth/google/callback`.
- [ ] Set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REDIRECT_URL`.
- [ ] Set `ADMIN_EMAILS` to controlled comma-separated addresses. Create first admin through email/password signup using one address, then verify admin access.
- [ ] Google accounts may sign up without invitation; valid invitation codes remain optional and are consumed when supplied.
- [ ] Test signup, login, logout, cookies, Google callback, invitation access, and admin authorization over HTTPS.

### Email, maps, and notifications

- [ ] Choose transactional email provider. Configure verified sender/domain, SPF, DKIM, DMARC.
- [ ] Do not assume SMTP configuration enables application email; current notification delivery code is incomplete. Track this as feature blocker if email alerts are required.
- [ ] Prefer configuring a production map style URL at build time with `VITE_MAP_STYLE_URL`. If empty, frontend falls back to OpenStreetMap raster tiles; verify OSM tile policy, attribution, and expected traffic first. Frontend values are public; use provider restrictions and attribution.
- [ ] VAPID values are currently unused by running server. Do not promise Web Push until provider wiring/retries exist.
- [ ] Confirm outbound HTTPS access to map provider and Google OAuth endpoints.

### Observability and operations

- [ ] Capture stdout/stderr from API/worker. Both emit JSON logs suitable for journald or log collector.
- [ ] Configure retention and alerting for restarts, panic logs, migration failures, DB failures, and notification failures.
- [ ] Monitor `GET /health/live` and `GET /health/ready`.
- [ ] Record `X-Request-ID` for failed requests.
- [ ] Review admin metrics and open safety reports during testing. Admin metrics is application data, not Prometheus exporter.
- [ ] Write rollback and restore test before destructive schema changes.

### Product and privacy

- [ ] Confirm city, timezone, venues, map provider terms, and public venue data.
- [ ] Review `docs/privacy.md`, `docs/terms.md`, and `docs/safety.md` for deployed country/city.
- [ ] Confirm account deletion, blocking, reporting, and private-location behavior.
- [ ] Never put `.env`, DB passwords, OAuth secrets, SMTP passwords, or private keys in Git or frontend `VITE_*` variables.

## Build release artifacts on Windows

Run from repository root. Replace map URL and target architecture as needed.

```powershell
npm --prefix web ci

make typecheck
make test

$env:VITE_MAP_STYLE_URL = "https://maps.example.com/styles/borajogar.json"
npm --prefix web run build
Remove-Item Env:VITE_MAP_STYLE_URL

# Linux x86_64 target. Use arm64 when server architecture differs.
$env:GOOS = "linux"
$env:GOARCH = "amd64"
go -C api build -trimpath -ldflags "-s -w" -o bin/server ./cmd/server
go -C api build -trimpath -ldflags "-s -w" -o bin/worker ./cmd/worker
Remove-Item Env:GOOS
Remove-Item Env:GOARCH

Get-FileHash api/bin/server,api/bin/worker -Algorithm SHA256
```

Build outputs:

- `web/dist/`: static frontend.
- `api/bin/server`: Linux API binary.
- `api/bin/worker`: Linux worker binary.

`VITE_API_PROXY_TARGET` is Vite development-only. Production browser requests use same-origin `/api/...` paths and must be routed by reverse proxy.

## Files to copy

Prefer versioned release directory. Copy only runtime artifacts:

```text
api/bin/server
api/bin/worker
api/migrations/*.sql
web/dist/**
```

Do not copy `web/node_modules`, `web/src`, local coverage, `api/bin/*.exe`, or `.env` into a shared release archive. Create env file directly on server with permissions `0600`, or use approved secret manager.

Example PowerShell transfer:

```powershell
$version = "20260806-1"
ssh deploy@your-server "sudo mkdir -p /opt/borajogar/releases/$version/api/bin /opt/borajogar/releases/$version/api/migrations /opt/borajogar/releases/$version/web"
scp api/bin/server deploy@your-server:/tmp/borajogar-server
scp api/bin/worker deploy@your-server:/tmp/borajogar-worker
scp -r api/migrations deploy@your-server:/tmp/borajogar-migrations-$version
scp -r web/dist deploy@your-server:/tmp/borajogar-dist-$version
ssh deploy@your-server "sudo cp -a /tmp/borajogar-migrations-$version/. /opt/borajogar/releases/$version/api/migrations/; sudo cp -a /tmp/borajogar-dist-$version/. /opt/borajogar/releases/$version/web/dist/; sudo install -o borajogar -g borajogar -m 0755 /tmp/borajogar-server /opt/borajogar/releases/$version/api/bin/server; sudo install -o borajogar -g borajogar -m 0755 /tmp/borajogar-worker /opt/borajogar/releases/$version/api/bin/worker; rm -rf /tmp/borajogar-server /tmp/borajogar-worker /tmp/borajogar-migrations-$version /tmp/borajogar-dist-$version; sudo chown -R borajogar:borajogar /opt/borajogar/releases/$version"
```

Use a new version every time. Do not upload over `current`.

## Server environment file

Create `/etc/borajogar/borajogar.env`:

```dotenv
APP_ENV=production
APP_BASE_URL=https://your-domain.example
APP_PORT=8080
DATABASE_URL=postgres://borajogar:REPLACE@db-host:5432/borajogar?sslmode=require
SESSION_SECRET=REPLACE_WITH_RANDOM_SECRET
GOOGLE_CLIENT_ID=REPLACE
GOOGLE_CLIENT_SECRET=REPLACE
GOOGLE_REDIRECT_URL=https://your-domain.example/api/v1/auth/google/callback
ADMIN_EMAILS=owner@example.com
DEFAULT_CITY_NAME=Curitiba
DEFAULT_TIMEZONE=America/Sao_Paulo
MATCH_LOOKAHEAD_DAYS=14
MATCH_DEFAULT_DURATION_MINUTES=90
MATCH_DEFAULT_PLAYER_COUNT=4
MATCH_SLOT_INCREMENT_MINUTES=30
MATCH_MAX_SKILL_DIFFERENCE=1
MATCH_MINIMUM_NOTICE_MINUTES=720
MATCH_PROPOSAL_EXPIRATION_HOURS=8
MATCH_MAX_PROPOSALS_PER_USER_PER_DAY=2
MATCH_RECENT_PAIRING_LOOKBACK_DAYS=14
```

`SMTP_*`, `VAPID_*`, and `VITE_*` are omitted because they are not runtime inputs to current API/worker path. Add SMTP only after notification delivery is wired/tested.

```bash
sudo chown root:borajogar /etc/borajogar/borajogar.env
sudo chmod 0640 /etc/borajogar/borajogar.env
```

## Database migration

Install pinned Goose version on server or run it from trusted machine with DB access:

```bash
go install github.com/pressly/goose/v3/cmd/goose@v3.24.3
set -a
. /etc/borajogar/borajogar.env
set +a
/home/borajogar/go/bin/goose \
  -dir /opt/borajogar/current/api/migrations \
  postgres "$DATABASE_URL" up
```

If `current` is not linked yet, use exact release path instead. Confirm migration status before restart. Take DB backup first for risky migrations.

## Release layout and services

```text
/opt/borajogar/releases/<version>/api/bin/server
/opt/borajogar/releases/<version>/api/bin/worker
/opt/borajogar/releases/<version>/api/migrations/*.sql
/opt/borajogar/releases/<version>/web/dist/*
/opt/borajogar/current -> /opt/borajogar/releases/<version>
/etc/borajogar/borajogar.env
```

After copying and migrating:

```bash
sudo ln -sfn /opt/borajogar/releases/20260806-1 /opt/borajogar/current
sudo systemctl daemon-reload
sudo systemctl enable --now borajogar-api borajogar-worker
sudo systemctl restart borajogar-api borajogar-worker
```

Create `/etc/systemd/system/borajogar-api.service`:

```ini
[Unit]
Description=Bora Jogar API
After=network-online.target
Wants=network-online.target

[Service]
User=borajogar
Group=borajogar
WorkingDirectory=/opt/borajogar/current
EnvironmentFile=/etc/borajogar/borajogar.env
ExecStart=/opt/borajogar/current/api/bin/server
Restart=on-failure
RestartSec=5
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=/opt/borajogar

[Install]
WantedBy=multi-user.target
```

Create `/etc/systemd/system/borajogar-worker.service` with same contents, changing Description and ExecStart:

```ini
Description=Bora Jogar worker
ExecStart=/opt/borajogar/current/api/bin/worker
```

Install units and inspect:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now borajogar-api borajogar-worker
sudo systemctl status borajogar-api borajogar-worker
sudo journalctl -u borajogar-api -u borajogar-worker -n 100 --no-pager
```

## Reverse proxy

Example Caddyfile for `your-domain.example`:

```caddy
your-domain.example {
    encode gzip

    handle /api/* {
        reverse_proxy 127.0.0.1:8080
    }

    handle /health/* {
        reverse_proxy 127.0.0.1:8080
    }

    root * /opt/borajogar/current/web/dist
    try_files {path} /index.html
    file_server
}
```

Proxy must preserve request cookies and support HTTPS redirects. Test deep links such as `/login`, `/dashboard`, and `/games/<id>` after hard refresh. Do not expose Mailpit remotely; development-only.

## First smoke test

```bash
curl -fsS https://your-domain.example/health/live
curl -fsS https://your-domain.example/health/ready
```

Then test private browser session:

1. Load app over HTTPS.
2. Create email/password account using configured admin email.
3. Confirm `borajogar_session` has `Secure`, `HttpOnly`, `SameSite=Lax`.
4. Complete onboarding.
5. Add/check venue and location permission.
6. Create, join, leave, cancel, and share a game.
7. Test invitation and Google OAuth after callback config is verified.
8. Test offline UI; state-changing operations must not silently queue.
9. Review API and worker logs.

## Deploying later release

1. Run local checks and build.
2. Create new version directory.
3. Copy binaries, migrations, and `web/dist`.
4. Verify SHA-256 hashes.
5. Back up DB when migration risk warrants it.
6. Run Goose migrations once.
7. Switch `/opt/borajogar/current` to new release.
8. Restart API and worker.
9. Check health, logs, login, and one critical game flow.
10. Keep previous release until smoke tests pass.

## Rollback

For application-only failure:

```bash
sudo ln -sfn /opt/borajogar/releases/<previous-version> /opt/borajogar/current
sudo systemctl restart borajogar-api borajogar-worker
sudo systemctl status borajogar-api borajogar-worker
```

Do not automatically roll back DB migrations with `migrate-down`. If migration caused failure, stop writes, preserve logs, verify backup, and use reviewed forward fix or restore.

## Useful commands

```bash
sudo journalctl -fu borajogar-api
sudo journalctl -fu borajogar-worker
curl -i https://your-domain.example/health/live
curl -i https://your-domain.example/health/ready
sudo systemctl restart borajogar-api borajogar-worker
sudo systemctl stop borajogar-api borajogar-worker
```
