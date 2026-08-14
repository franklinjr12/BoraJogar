package auth

import (
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestGenerateInvitationCodeIsURLSafeAndHashOnly(t *testing.T) {
	code, codeHash, err := GenerateInvitationCode()
	if err != nil {
		t.Fatal(err)
	}
	if len(code) < 30 || strings.ContainsAny(code, "+/=") {
		t.Fatalf("code is not URL-safe: %q", code)
	}
	if codeHash == code || len(codeHash) != 64 {
		t.Fatalf("hash = %q", codeHash)
	}
}

func TestGoogleAuthorizationURLContainsStateAndRedirect(t *testing.T) {
	client := GoogleHTTPClient{ClientID: "client-id", ClientSecret: "secret"}
	value := client.AuthorizationURL("state-value", "http://localhost/callback")
	for _, expected := range []string{"state=state-value", "client_id=client-id", "redirect_uri=http%3A%2F%2Flocalhost%2Fcallback"} {
		if !strings.Contains(value, expected) {
			t.Fatalf("URL %q missing %q", value, expected)
		}
	}
}

func TestAdminEmailMatchingIsCaseInsensitive(t *testing.T) {
	h := Handler{AdminEmails: "owner@example.com, other@example.com"}
	if !h.isAdminEmail("OWNER@example.com") {
		t.Fatal("expected admin email")
	}
	if h.isAdminEmail("player@example.com") {
		t.Fatal("unexpected admin email")
	}
}

func TestSafeReturnToAllowsOnlyRelativeAppPaths(t *testing.T) {
	if got := safeReturnTo("/games/abc?access=token"); got != "/games/abc?access=token" {
		t.Fatalf("safe returnTo = %q", got)
	}
	for _, value := range []string{"https://evil.example/games/abc", "//evil.example", `\evil`, ""} {
		if got := safeReturnTo(value); got != "" {
			t.Fatalf("unsafe returnTo %q accepted as %q", value, got)
		}
	}
}

func TestPostAuthRedirectPreservesSafeReturnTo(t *testing.T) {
	user := User{OnboardingComplete: false}
	if got := postAuthRedirect(user, "/games/abc?access=token"); got != "/games/abc?access=token" {
		t.Fatalf("redirect = %q", got)
	}
	if got := postAuthRedirect(user, "https://evil.example"); got != "/onboarding" {
		t.Fatalf("fallback redirect = %q", got)
	}
}

func TestAuthErrorRedirectUsesStableCode(t *testing.T) {
	h := Handler{}
	res := httptest.NewRecorder()
	h.authError(res, httptest.NewRequest(http.MethodGet, "/api/v1/auth/google/callback", nil), googleErrorProviderFailed)
	if res.Code != http.StatusFound {
		t.Fatalf("status = %d", res.Code)
	}
	if got := res.Header().Get("Location"); got != "/login?error=google_provider_failed" {
		t.Fatalf("location = %q", got)
	}
}

func TestStartGoogleClearsStaleInvitationWithoutCode(t *testing.T) {
	h := Handler{Google: GoogleHTTPClient{ClientID: "client-id"}, RedirectURL: "https://example.com/callback"}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google", nil)
	req.AddCookie(&http.Cookie{Name: "borajogar_invitation", Value: "stale-code"})
	res := httptest.NewRecorder()
	h.startGoogle(res, req)

	for _, cookie := range res.Result().Cookies() {
		if cookie.Name == "borajogar_invitation" {
			if cookie.MaxAge >= 0 || cookie.Value != "" {
				t.Fatalf("stale invitation cookie was not cleared: %+v", cookie)
			}
			return
		}
	}
	t.Fatal("expected stale invitation cookie deletion")
}

func TestStartGoogleUsesConfiguredClientAndRedirect(t *testing.T) {
	h := Handler{Google: GoogleHTTPClient{ClientID: "production-client-id"}, RedirectURL: "https://example.com/api/v1/auth/google/callback"}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/google?returnTo=%2Fgames%2Fgame-id%3Faccess%3Dtoken", nil)
	res := httptest.NewRecorder()
	h.startGoogle(res, req)

	location, err := url.Parse(res.Header().Get("Location"))
	if err != nil {
		t.Fatal(err)
	}
	if got := location.Query().Get("client_id"); got != "production-client-id" {
		t.Fatalf("client_id = %q", got)
	}
	if got := location.Query().Get("redirect_uri"); got != h.RedirectURL {
		t.Fatalf("redirect_uri = %q", got)
	}
	if got := location.Query().Get("state"); got == "" {
		t.Fatal("missing OAuth state")
	}
	for _, cookie := range res.Result().Cookies() {
		if cookie.Name == returnToCookie && cookie.Value != "%2Fgames%2Fgame-id%3Faccess%3Dtoken" {
			t.Fatalf("returnTo cookie = %q", cookie.Value)
		}
	}
}

func TestOptionalAuthAllowsAnonymousRequests(t *testing.T) {
	called := false
	handler := (Handler{}).OptionalAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		called = true
		if _, ok := UserFromContext(r.Context()); ok {
			t.Fatal("anonymous request unexpectedly has user context")
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/", nil))
	if response.Code != http.StatusNoContent || !called {
		t.Fatalf("status=%d called=%v", response.Code, called)
	}
}
