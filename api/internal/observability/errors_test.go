package observability

import (
	"context"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
)

type recordingStore struct {
	events []Event
}

func (s *recordingStore) Record(_ context.Context, event Event) error {
	s.events = append(s.events, event)
	return nil
}

type failingStore struct{}

func (failingStore) Record(context.Context, Event) error {
	return context.DeadlineExceeded
}

func TestClientErrorInputValidatesAndAssociatesUser(t *testing.T) {
	userID := uuid.New()
	input := clientErrorInput{
		Kind:       KindAPIError,
		Name:       "ApiError",
		Message:    "Request failed for ana@example.com",
		PagePath:   "/games/game-1?access=secret",
		StatusCode: intPtr(http.StatusBadGateway),
	}
	event, err := input.event(&userID, "browser")
	if err == nil {
		t.Fatal("expected invalid query-bearing page path")
	}

	input.PagePath = "/games/game-1"
	event, err = input.event(&userID, "browser")
	if err != nil {
		t.Fatal(err)
	}
	if event.UserID == nil || *event.UserID != userID {
		t.Fatalf("user id = %v", event.UserID)
	}
	if event.Source != SourceFrontend || event.Kind != KindAPIError {
		t.Fatalf("event = %+v", event)
	}
	if got := redactText("failure?access=secret"); got != "failure?access=[redacted-query]" {
		t.Fatalf("redacted query = %q", got)
	}
}

func TestClientErrorInputRejectsInvalidFields(t *testing.T) {
	now := time.Date(2026, time.August, 13, 12, 0, 0, 0, time.UTC)
	cases := []clientErrorInput{
		{Kind: "unknown", Message: "message"},
		{Kind: KindAPIError, Message: ""},
		{Kind: KindAPIError, Message: "message", RequestPath: "https://example.com/private"},
		{Kind: KindAPIError, Message: "message", StatusCode: intPtr(99)},
		{Kind: KindAPIError, Message: "message", ViewportWidth: intPtr(10001)},
		{Kind: KindAPIError, Message: strings.Repeat("x", 4001)},
		{Kind: KindAPIError, Message: "message", OccurredAt: timePtr(now.Add(-31 * 24 * time.Hour))},
		{Kind: KindAPIError, Message: "message", OccurredAt: timePtr(now.Add(25 * time.Hour))},
	}
	for _, input := range cases {
		if _, err := input.eventAt(nil, "", now); err == nil {
			t.Fatalf("expected invalid input: %+v", input)
		}
	}
}

func TestRateLimiterAllowsSixtyReportsPerMinute(t *testing.T) {
	limiter := NewRateLimiter()
	limiter.limit = 2
	limiter.now = func() time.Time { return time.Unix(100, 0) }
	if !limiter.Allow("127.0.0.1") || !limiter.Allow("127.0.0.1") {
		t.Fatal("expected first reports to be allowed")
	}
	if limiter.Allow("127.0.0.1") {
		t.Fatal("expected report limit")
	}
	limiter.now = func() time.Time { return time.Unix(161, 0) }
	if !limiter.Allow("127.0.0.1") {
		t.Fatal("expected new window to allow report")
	}
}

func TestClientErrorHandlerReturnsValidationRateLimitAndSuccess(t *testing.T) {
	store := &recordingStore{}
	limiter := NewRateLimiter()
	limiter.limit = 2
	handler := Handler{Recorder: store, Limiter: limiter}

	request := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", nil)
	response := httptest.NewRecorder()
	handler.clientErrors(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("invalid status = %d", response.Code)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", stringsReader(`{"kind":"api_error","message":"failed","pagePath":"/dashboard"}`))
	request = request.WithContext(auth.WithUserContext(request.Context(), auth.User{ID: uuid.New()}))
	response = httptest.NewRecorder()
	handler.clientErrors(response, request)
	if response.Code != http.StatusNoContent || len(store.events) != 1 || store.events[0].UserID == nil {
		t.Fatalf("success status=%d events=%+v", response.Code, store.events)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", stringsReader(`{"kind":"api_error","message":"failed"}`))
	response = httptest.NewRecorder()
	handler.clientErrors(response, request)
	if response.Code != http.StatusTooManyRequests {
		t.Fatalf("rate limit status = %d", response.Code)
	}
}

func TestClientErrorHandlerDoesNotExposePersistenceFailures(t *testing.T) {
	handler := Handler{Recorder: failingStore{}, Logger: slog.Default()}
	request := httptest.NewRequest(http.MethodPost, "/api/v1/client-errors", stringsReader(`{"kind":"api_error","message":"failed"}`))
	response := httptest.NewRecorder()
	handler.clientErrors(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, body = %s", response.Code, response.Body.String())
	}
}

func stringsReader(value string) *strings.Reader {
	return strings.NewReader(value)
}

func timePtr(value time.Time) *time.Time {
	return &value
}
