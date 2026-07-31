package main

import (
	"context"
	"fmt"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const defaultE2EDatabaseURL = "postgres://borajogar:borajogar@localhost:5432/borajogar_e2e?sslmode=disable"

func main() {
	if len(os.Args) != 2 || os.Args[1] != "reset" {
		fatal("usage: go run ./cmd/tools/e2e-db reset")
	}
	targetURL := getenv("E2E_DATABASE_URL", defaultE2EDatabaseURL)
	dbName, adminURL, err := adminConnection(targetURL)
	if err != nil {
		fatal(err.Error())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := pgxpool.New(ctx, adminURL)
	if err != nil {
		fatal(err.Error())
	}
	defer db.Close()
	if err = db.Ping(ctx); err != nil {
		fatal(err.Error())
	}

	quoted := pgx.Identifier{dbName}.Sanitize()
	if _, err = db.Exec(ctx, `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1 AND pid <> pg_backend_pid()`, dbName); err != nil {
		fatal(err.Error())
	}
	if _, err = db.Exec(ctx, "DROP DATABASE IF EXISTS "+quoted); err != nil {
		fatal(err.Error())
	}
	if _, err = db.Exec(ctx, "CREATE DATABASE "+quoted); err != nil {
		fatal(err.Error())
	}
	fmt.Println("e2e database reset:", dbName)
}

func adminConnection(target string) (string, string, error) {
	parsed, err := url.Parse(target)
	if err != nil {
		return "", "", err
	}
	dbName := strings.TrimPrefix(parsed.Path, "/")
	if dbName == "" || dbName == "postgres" {
		return "", "", fmt.Errorf("E2E_DATABASE_URL must name a non-postgres database")
	}
	admin := getenv("E2E_DATABASE_ADMIN_URL", "")
	if admin == "" {
		adminURL := *parsed
		adminURL.Path = "/postgres"
		admin = adminURL.String()
	}
	return dbName, admin, nil
}

func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func fatal(message string) {
	fmt.Fprintln(os.Stderr, message)
	os.Exit(1)
}
