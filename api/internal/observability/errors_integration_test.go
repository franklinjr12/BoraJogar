//go:build integration

package observability

import (
	"context"
	"os"
	"testing"

	"github.com/google/uuid"
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

func TestStorePersistsErrorEventAndNullsDeletedUser(t *testing.T) {
	db := integrationDB(t)
	userID := uuid.New()
	if _, err := db.Exec(context.Background(), `
		INSERT INTO users(id,google_subject,email,display_name,password_hash)
		VALUES($1,NULL,$2,'Error Fixture','fixture-password')`, userID, userID.String()+"@example.test"); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, userID) })

	requestID := "integration-error-" + uuid.NewString()
	err := (Store{DB: db}).Record(context.Background(), Event{
		Source:        SourceFrontend,
		Kind:          KindAPIError,
		UserID:        &userID,
		ErrorName:     "ApiError",
		Message:       "Failed for fixture@example.test",
		PagePath:      "/dashboard",
		RequestMethod: "GET",
		RequestPath:   "/api/v1/me/dashboard",
		RequestID:     requestID,
		StatusCode:    intPtr(503),
		UserAgent:     "integration-browser",
	})
	if err != nil {
		t.Fatal(err)
	}

	var id uuid.UUID
	var storedUser *uuid.UUID
	var message string
	if err := db.QueryRow(context.Background(), `SELECT id,user_id,message FROM error_events WHERE request_id=$1`, requestID).Scan(&id, &storedUser, &message); err != nil {
		t.Fatal(err)
	}
	if storedUser == nil || *storedUser != userID {
		t.Fatalf("stored user = %v", storedUser)
	}
	if message != "Failed for [redacted-email]" {
		t.Fatalf("message = %q", message)
	}
	t.Cleanup(func() { _, _ = db.Exec(context.Background(), `DELETE FROM error_events WHERE id=$1`, id) })

	if _, err := db.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, userID); err != nil {
		t.Fatal(err)
	}
	if err := db.QueryRow(context.Background(), `SELECT user_id FROM error_events WHERE id=$1`, id).Scan(&storedUser); err != nil {
		t.Fatal(err)
	}
	if storedUser != nil {
		t.Fatalf("expected deleted user to null user_id, got %v", storedUser)
	}
}
