package httpserver

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/borajogar/borajogar/api/internal/observability"
)

type recordingErrorStore struct {
	events []observability.Event
}

func (s *recordingErrorStore) Record(_ context.Context, event observability.Event) error {
	s.events = append(s.events, event)
	return nil
}

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

func TestClientErrorsRouteIsPublic(t *testing.T) {
	server := New(slog.Default(), nil)
	request := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", strings.NewReader(`{"kind":"uncaught_error","message":"boom","pagePath":"/"}`))
	response := httptest.NewRecorder()
	server.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
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

func TestRequestLoggerRecordsEachBackendFiveHundred(t *testing.T) {
	store := &recordingErrorStore{}
	handler := requestLogger(slog.Default(), nil, store, http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
	}))
	request := httptest.NewRequest(http.MethodGet, "/api/v1/games", nil)
	request.Header.Set("X-Request-ID", "request-500")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)

	if len(store.events) != 1 || store.events[0].Kind != observability.KindHTTP5xx {
		t.Fatalf("events = %+v", store.events)
	}
}

func TestRecovererRecordsPanicAndReturnsSafeResponse(t *testing.T) {
	store := &recordingErrorStore{}
	handler := recoverer(slog.Default(), store, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("boom")
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/v1/dashboard", nil))

	if response.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d", response.Code)
	}
	if len(store.events) != 1 || store.events[0].Kind != observability.KindPanic {
		t.Fatalf("events = %+v", store.events)
	}
}

func TestRecovererDoesNotSelfCaptureClientErrorEndpoint(t *testing.T) {
	store := &recordingErrorStore{}
	handler := recoverer(slog.Default(), store, http.HandlerFunc(func(http.ResponseWriter, *http.Request) {
		panic("reporter failure")
	}))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", nil))

	if response.Code != http.StatusInternalServerError || len(store.events) != 0 {
		t.Fatalf("status=%d events=%+v", response.Code, store.events)
	}
}
