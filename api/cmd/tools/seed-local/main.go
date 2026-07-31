package main

import (
	"context"
	_ "embed"
	"fmt"
	"os"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

//go:embed seed.sql
var seedSQL string

func main() {
	databaseURL := os.Getenv("DATABASE_URL")
	if databaseURL == "" {
		databaseURL = "postgres://borajogar:borajogar@localhost:5432/borajogar?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	db, err := pgxpool.New(ctx, databaseURL)
	if err != nil {
		fatal(err)
	}
	defer db.Close()

	if err := db.Ping(ctx); err != nil {
		fatal(err)
	}
	if _, err := db.Exec(ctx, seedSQL); err != nil {
		fatal(fmt.Errorf("execute local seed: %w", err))
	}

	fmt.Println("local seed applied")
}

func fatal(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}
