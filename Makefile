SHELL := cmd.exe
.SHELLFLAGS := /C
DATABASE_URL ?= postgres://borajogar:borajogar@localhost:5432/borajogar?sslmode=disable

dev:
	start "Bora Jogar API" cmd /C "make dev-api" && make dev-web

install-hooks:
	git config core.hooksPath .githooks

ci-local:
	make lint && make typecheck && make test && make test-coverage && make build

dev-web:
	npm --prefix web run dev

dev-api:
	go -C api run ./cmd/server

dev-worker:
	go -C api run ./cmd/worker

send-test-email:
	go -C api run ./cmd/tools/send-test-email

test:
	npm --prefix web run test && go -C api test ./...

test-coverage:
	go -C api test ./... -coverprofile=coverage && go -C api tool cover -func=coverage

agent-check:
	make lint && make typecheck && make test && make test-coverage && make build

test-integration:
	docker compose up -d database && make migrate && go -C api test ./... -tags=integration

lint:
	npm --prefix web run lint && npm --prefix web run format:check && gofmt -l api

typecheck:
	npm --prefix web run typecheck

generate:
	go -C api run github.com/sqlc-dev/sqlc/cmd/sqlc@v1.29.0 generate

migrate:
	go -C api run github.com/pressly/goose/v3/cmd/goose@v3.24.3 -dir migrations postgres "$(DATABASE_URL)" up

migrate-down:
	go -C api run github.com/pressly/goose/v3/cmd/goose@v3.24.3 -dir migrations postgres "$(DATABASE_URL)" down

seed:
	go -C api run ./cmd/tools/seed-local

db-reset:
	docker compose down -v && docker compose up -d database && make migrate

build:
	npm --prefix web run build && go -C api build -o bin/server ./cmd/server && go -C api build -o bin/worker ./cmd/worker
