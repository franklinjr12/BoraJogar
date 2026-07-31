package auth

import "testing"

func TestSessionCookieNameIsStable(t *testing.T) {
	if sessionCookie != "borajogar_session" {
		t.Fatalf("cookie = %q", sessionCookie)
	}
}
