package httpserver

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestRequestIDIsReturned(t *testing.T) {
	server := New(slog.Default(), nil)
	req := httptest.NewRequest(http.MethodGet, "/health/live", nil)
	req.Header.Set("X-Request-ID", "request-test-1")
	res := httptest.NewRecorder()
	server.ServeHTTP(res, req)
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
	if got := res.Header().Get("X-Request-ID"); got != "request-test-1" {
		t.Fatalf("request id = %q", got)
	}
}

func TestMissingRouteDoesNotPanic(t *testing.T) {
	server := New(slog.Default(), nil)
	res := httptest.NewRecorder()
	server.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/missing", nil))
	if res.Code != http.StatusNotFound {
		t.Fatalf("status = %d", res.Code)
	}
}
