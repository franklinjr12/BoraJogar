package httpserver

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestErrorIncludesRequestID(t *testing.T) {
	res := httptest.NewRecorder()
	w := &requestIDWriter{ResponseWriter: res, requestID: "req-test"}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusConflict)
	_, _ = w.Write([]byte(`{"error":{"code":"conflict","message":"Conflict.","fields":{}}}`))
	if res.Code != http.StatusConflict {
		t.Fatalf("status = %d", res.Code)
	}
	var body map[string]any
	if err := json.Unmarshal(res.Body.Bytes(), &body); err != nil {
		t.Fatal(err)
	}
	if body["requestId"] == nil || body["requestId"] == "" {
		t.Fatalf("missing requestId: %s", res.Body.String())
	}
}

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

func TestRequestIDIsCopiedToRequest(t *testing.T) {
	var received string
	handler := requestID(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		received = r.Header.Get("X-Request-ID")
		w.WriteHeader(http.StatusNoContent)
	}))
	res := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodGet, "/", nil)
	handler.ServeHTTP(res, req)
	if res.Code != http.StatusNoContent {
		t.Fatalf("status = %d", res.Code)
	}
	if received == "" {
		t.Fatal("request ID was not copied to request")
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

func TestLiveHealthDoesNotRequireDatabase(t *testing.T) {
	server := New(slog.Default(), nil)
	res := httptest.NewRecorder()
	server.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/health/live", nil))
	if res.Code != http.StatusOK {
		t.Fatalf("status = %d", res.Code)
	}
}

func TestReadyHealthFailsWithoutDatabase(t *testing.T) {
	server := New(slog.Default(), nil)
	res := httptest.NewRecorder()
	server.ServeHTTP(res, httptest.NewRequest(http.MethodGet, "/health/ready", nil))
	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", res.Code)
	}
}
