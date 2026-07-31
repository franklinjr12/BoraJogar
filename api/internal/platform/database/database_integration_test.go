//go:build integration

package database

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(context.Background()); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return db
}

func TestPostGISVenueDistanceUsesSpatialIndex(t *testing.T) {
	db := integrationDB(t)
	var postGIS string
	if err := db.QueryRow(context.Background(), "SELECT PostGIS_Version()").Scan(&postGIS); err != nil {
		t.Fatalf("PostGIS unavailable: %v", err)
	}
	var used bool
	err := db.QueryRow(context.Background(), `
		SELECT COALESCE(indexdef LIKE '%venues_location_gist_idx%', false)
		FROM pg_indexes WHERE schemaname = current_schema() AND indexname = 'venues_location_gist_idx'`).Scan(&used)
	if err != nil || !used {
		t.Fatalf("venue spatial index missing (PostGIS %s): used=%v err=%v", postGIS, used, err)
	}
	var distance float64
	err = db.QueryRow(context.Background(), `SELECT ST_Distance(
		ST_SetSRID(ST_MakePoint(-46.6,-23.5),4326)::geography,
		ST_SetSRID(ST_MakePoint(-46.61,-23.5),4326)::geography)`).Scan(&distance)
	if err != nil || distance <= 0 {
		t.Fatalf("distance query = %v, err=%v", distance, err)
	}
}

func TestTransactionRollbackLeavesNoFixtureRow(t *testing.T) {
	db := integrationDB(t)
	tx, err := db.Begin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	_, err = tx.Exec(context.Background(), `CREATE TEMP TABLE rollback_probe(value text)`)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = tx.Exec(context.Background(), `INSERT INTO rollback_probe(value) VALUES('must disappear')`); err != nil {
		t.Fatal(err)
	}
	if err := tx.Rollback(context.Background()); err != nil {
		t.Fatal(err)
	}
	var exists bool
	err = db.QueryRow(context.Background(), `SELECT EXISTS(SELECT 1 FROM pg_tables WHERE tablename='rollback_probe')`).Scan(&exists)
	if err != nil || exists {
		t.Fatalf("rollback left temporary table: exists=%v err=%v", exists, err)
	}
}
