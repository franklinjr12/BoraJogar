//go:build integration

package auth

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type integrationGoogleClient struct {
	profile GoogleProfile
	err     error
}

func (c integrationGoogleClient) AuthorizationURL(state, _ string) string {
	return "https://accounts.google.test/auth?state=" + url.QueryEscape(state)
}

func (c integrationGoogleClient) Exchange(context.Context, string, string) (GoogleProfile, error) {
	return c.profile, c.err
}

func integrationGoogleProfile(suffix string) GoogleProfile {
	return GoogleProfile{
		Subject:       "google-subject-" + suffix,
		Email:         "google-" + suffix + "@example.com",
		Name:          "Google Player",
		AvatarURL:     "https://example.com/avatar.png",
		EmailVerified: true,
	}
}

func cleanupGoogleUser(t *testing.T, db *pgxpool.Pool, profile GoogleProfile) {
	t.Helper()
	_, _ = db.Exec(context.Background(), `DELETE FROM users WHERE google_subject = $1 OR email = $2`, profile.Subject, profile.Email)
}

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

func TestGoogleUserCreationWithoutInvitationIntegration(t *testing.T) {
	h, db := integrationAuthHandler(t)
	ctx := context.Background()
	profile := integrationGoogleProfile("without-invitation")
	cleanupGoogleUser(t, db, profile)
	t.Cleanup(func() { cleanupGoogleUser(t, db, profile) })

	user, created, err := h.upsertUser(ctx, profile, "")
	if err != nil {
		t.Fatal(err)
	}
	if !created {
		t.Fatal("expected a new Google user")
	}
	if user.Email != profile.Email {
		t.Fatalf("email = %q", user.Email)
	}

	profile.Name = "Updated Google Player"
	updated, created, err := h.upsertUser(ctx, profile, "")
	if err != nil {
		t.Fatal(err)
	}
	if created || updated.ID != user.ID {
		t.Fatalf("expected existing user reuse: created=%t id=%s user=%s", created, updated.ID, user.ID)
	}
}

func TestGoogleValidInvitationIsOptionalButConsumedIntegration(t *testing.T) {
	h, db := integrationAuthHandler(t)
	ctx := context.Background()
	profile := integrationGoogleProfile("valid-invitation")
	cleanupGoogleUser(t, db, profile)
	code, codeHash, err := GenerateInvitationCode()
	if err != nil {
		t.Fatal(err)
	}
	invitationID := uuid.New()
	if _, err := db.Exec(ctx, `INSERT INTO invitations (id, code_hash, email, max_uses) VALUES ($1, $2, $3, 1)`, invitationID, codeHash, profile.Email); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(ctx, `DELETE FROM invitations WHERE id = $1`, invitationID)
		cleanupGoogleUser(t, db, profile)
	})

	if _, created, err := h.upsertUser(ctx, profile, code); err != nil || !created {
		t.Fatalf("upsert with invitation: created=%t err=%v", created, err)
	}
	var uses int
	if err := db.QueryRow(ctx, `SELECT current_uses FROM invitations WHERE id = $1`, invitationID).Scan(&uses); err != nil {
		t.Fatal(err)
	}
	if uses != 1 {
		t.Fatalf("current_uses = %d, want 1", uses)
	}
}

func TestGoogleInvalidInvitationRollsBackIntegration(t *testing.T) {
	h, db := integrationAuthHandler(t)
	ctx := context.Background()
	profile := integrationGoogleProfile("invalid-invitation")
	cleanupGoogleUser(t, db, profile)
	t.Cleanup(func() { cleanupGoogleUser(t, db, profile) })

	if _, created, err := h.upsertUser(ctx, profile, "missing-code"); err != ErrInvalidInvitation || created {
		t.Fatalf("upsert with invalid invitation: created=%t err=%v", created, err)
	}
	var users int
	if err := db.QueryRow(ctx, `SELECT count(*) FROM users WHERE google_subject = $1`, profile.Subject).Scan(&users); err != nil {
		t.Fatal(err)
	}
	if users != 0 {
		t.Fatalf("users = %d after rejected invitation, want 0", users)
	}
}

func TestGoogleUserLinksExistingEmailAccountIntegration(t *testing.T) {
	h, db := integrationAuthHandler(t)
	ctx := context.Background()
	profile := integrationGoogleProfile("existing-email")
	_, _ = db.Exec(ctx, `DELETE FROM users WHERE email = $1`, profile.Email)
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE email = $1`, profile.Email) })

	if _, err := h.createEmailUser(ctx, emailAuthInput{Email: profile.Email, Password: "password", DisplayName: "Email Player"}); err != nil {
		t.Fatal(err)
	}
	linked, created, err := h.upsertUser(ctx, profile, "")
	if err != nil || created {
		t.Fatalf("upsert with existing email: created=%t err=%v", created, err)
	}
	var googleSubject *string
	if err := db.QueryRow(ctx, `SELECT google_subject FROM users WHERE email = $1`, profile.Email).Scan(&googleSubject); err != nil {
		t.Fatal(err)
	}
	if googleSubject == nil || *googleSubject != profile.Subject {
		t.Fatalf("google_subject = %v, want %q", googleSubject, profile.Subject)
	}
	if linked.Email != profile.Email || linked.DisplayName != profile.Name {
		t.Fatalf("linked user = %+v", linked)
	}
}

func TestGoogleCallbackLogsSafeValidationDataIntegration(t *testing.T) {
	profile := integrationGoogleProfile("logged")
	h, db := integrationAuthHandler(t)
	cleanupGoogleUser(t, db, profile)
	t.Cleanup(func() { cleanupGoogleUser(t, db, profile) })
	var logs bytes.Buffer
	h.Google = integrationGoogleClient{profile: profile}
	h.RedirectURL = "https://borajogar.example/api/v1/auth/google/callback"
	h.Logger = slog.New(slog.NewJSONHandler(&logs, nil))

	startRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google", nil)
	startRequest.Header.Set("X-Request-ID", "google-log-request")
	startResponse := httptest.NewRecorder()
	h.startGoogle(startResponse, startRequest)
	stateCookie := startResponse.Result().Cookies()[0]

	callbackRequest := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback?state="+url.QueryEscape(stateCookie.Value)+"&code=one-time-code", nil)
	callbackRequest.Header.Set("X-Request-ID", "google-log-request")
	callbackRequest.AddCookie(stateCookie)
	callbackResponse := httptest.NewRecorder()
	h.googleCallback(callbackResponse, callbackRequest)
	if callbackResponse.Code != http.StatusFound {
		t.Fatalf("callback status = %d body = %s", callbackResponse.Code, callbackResponse.Body.String())
	}

	output := logs.String()
	for _, secret := range []string{profile.Email, profile.Subject, stateCookie.Value, "one-time-code"} {
		if strings.Contains(output, secret) {
			t.Fatalf("log contains sensitive value %q: %s", secret, output)
		}
	}
	for _, expected := range []string{"google auth started", "google profile validated", "google user authenticated", "google session created", "google-log-request"} {
		if !strings.Contains(output, expected) {
			t.Fatalf("logs missing %q: %s", expected, output)
		}
	}
}
