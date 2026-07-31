//go:build integration

package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationAuthHandler(t *testing.T) (*Handler, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	return &Handler{DB: db}, db
}

func TestEmailSignupAndLoginIntegration(t *testing.T) {
	h, db := integrationAuthHandler(t)
	ctx := context.Background()
	email := "local-auth@example.com"
	_, _ = db.Exec(ctx, `DELETE FROM users WHERE email = $1`, email)
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE email = $1`, email) })

	signup := httptest.NewRecorder()
	h.emailSignup(signup, httptest.NewRequest(http.MethodPost, "/api/v1/auth/email/signup", strings.NewReader(`{"email":"local-auth@example.com","password":"pw","displayName":"Local Auth"}`)))
	if signup.Code != http.StatusOK {
		t.Fatalf("signup status = %d body = %s", signup.Code, signup.Body.String())
	}
	if len(signup.Result().Cookies()) == 0 {
		t.Fatal("expected session cookie")
	}
	var payload struct {
		RedirectTo string `json:"redirectTo"`
	}
	if err := json.NewDecoder(signup.Body).Decode(&payload); err != nil {
		t.Fatal(err)
	}
	if payload.RedirectTo != "/onboarding" {
		t.Fatalf("redirectTo = %q", payload.RedirectTo)
	}

	wrong := httptest.NewRecorder()
	h.emailLogin(wrong, httptest.NewRequest(http.MethodPost, "/api/v1/auth/email/login", strings.NewReader(`{"email":"local-auth@example.com","password":"bad"}`)))
	if wrong.Code != http.StatusUnauthorized {
		t.Fatalf("wrong password status = %d", wrong.Code)
	}

	login := httptest.NewRecorder()
	h.emailLogin(login, httptest.NewRequest(http.MethodPost, "/api/v1/auth/email/login", strings.NewReader(`{"email":"local-auth@example.com","password":"pw"}`)))
	if login.Code != http.StatusOK {
		t.Fatalf("login status = %d body = %s", login.Code, login.Body.String())
	}
}
