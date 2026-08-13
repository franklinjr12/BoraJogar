package observability

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/borajogar/borajogar/api/generated"
	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
)

const (
	SourceFrontend = "frontend"
	SourceBackend  = "backend"

	KindUncaughtError      = "uncaught_error"
	KindUnhandledRejection = "unhandled_rejection"
	KindReactError         = "react_error"
	KindAPIError           = "api_error"
	KindHTTP5xx            = "http_5xx"
	KindPanic              = "panic"
)

var validFrontendKinds = map[string]bool{
	KindUncaughtError:      true,
	KindUnhandledRejection: true,
	KindReactError:         true,
	KindAPIError:           true,
}

var (
	emailPattern = regexp.MustCompile(`[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}`)
	queryPattern = regexp.MustCompile(`(?i)([?&](?:access|token|code|state|password|secret)=)[^&\s)]*`)
)

type Event struct {
	Source         string
	Kind           string
	UserID         *uuid.UUID
	OccurredAt     *time.Time
	ErrorName      string
	Message        string
	StackTrace     string
	ComponentStack string
	PagePath       string
	RequestMethod  string
	RequestPath    string
	RequestID      string
	StatusCode     *int
	AppVersion     string
	Locale         string
	TimeZone       string
	ViewportWidth  *int
	ViewportHeight *int
	Online         *bool
	UserAgent      string
}

type Recorder interface {
	Record(context.Context, Event) error
}

type Store struct {
	DB *pgxpool.Pool
}

func (s Store) Record(ctx context.Context, event Event) error {
	if s.DB == nil {
		return errors.New("error event database is unavailable")
	}
	params := generated.InsertErrorEventParams{
		ID:             uuidParam(uuid.New()),
		Source:         event.Source,
		Kind:           event.Kind,
		UserID:         nullableUUID(event.UserID),
		OccurredAt:     nullableTime(event.OccurredAt),
		ErrorName:      truncate(redactText(event.ErrorName), 128),
		Message:        truncate(redactText(event.Message), 4000),
		StackTrace:     nullableText(truncate(redactText(event.StackTrace), 16000)),
		ComponentStack: nullableText(truncate(redactText(event.ComponentStack), 16000)),
		PagePath:       truncate(strings.TrimSpace(event.PagePath), 512),
		RequestMethod:  nullableText(truncate(event.RequestMethod, 16)),
		RequestPath:    nullableText(truncate(event.RequestPath, 512)),
		RequestID:      nullableText(truncate(event.RequestID, 128)),
		StatusCode:     nullableInt(event.StatusCode),
		AppVersion:     nullableText(truncate(event.AppVersion, 128)),
		Locale:         nullableText(truncate(event.Locale, 64)),
		TimeZone:       nullableText(truncate(event.TimeZone, 128)),
		ViewportWidth:  nullableInt(event.ViewportWidth),
		ViewportHeight: nullableInt(event.ViewportHeight),
		Online:         nullableBool(event.Online),
		UserAgent:      nullableText(truncate(redactText(event.UserAgent), 1024)),
	}
	return generated.New(s.DB).InsertErrorEvent(ctx, params)
}

func uuidParam(value uuid.UUID) pgtype.UUID {
	return pgtype.UUID{Bytes: value, Valid: true}
}

func nullableUUID(value *uuid.UUID) pgtype.UUID {
	if value == nil {
		return pgtype.UUID{}
	}
	return uuidParam(*value)
}

func nullableTime(value *time.Time) pgtype.Timestamptz {
	if value == nil {
		return pgtype.Timestamptz{}
	}
	return pgtype.Timestamptz{Time: value.UTC(), Valid: true}
}

func nullableText(value string) pgtype.Text {
	value = strings.TrimSpace(value)
	return pgtype.Text{String: value, Valid: value != ""}
}

func nullableInt(value *int) pgtype.Int4 {
	if value == nil {
		return pgtype.Int4{}
	}
	return pgtype.Int4{Int32: int32(*value), Valid: true}
}

func nullableBool(value *bool) pgtype.Bool {
	if value == nil {
		return pgtype.Bool{}
	}
	return pgtype.Bool{Bool: *value, Valid: true}
}

type clientErrorInput struct {
	Kind           string     `json:"kind"`
	Name           string     `json:"name"`
	Message        string     `json:"message"`
	StackTrace     string     `json:"stackTrace"`
	ComponentStack string     `json:"componentStack"`
	PagePath       string     `json:"pagePath"`
	RequestMethod  string     `json:"requestMethod"`
	RequestPath    string     `json:"requestPath"`
	RequestID      string     `json:"requestId"`
	StatusCode     *int       `json:"statusCode"`
	OccurredAt     *time.Time `json:"occurredAt"`
	AppVersion     string     `json:"appVersion"`
	Locale         string     `json:"locale"`
	TimeZone       string     `json:"timeZone"`
	ViewportWidth  *int       `json:"viewportWidth"`
	ViewportHeight *int       `json:"viewportHeight"`
	Online         *bool      `json:"online"`
}

func (in clientErrorInput) event(userID *uuid.UUID, userAgent string) (Event, error) {
	return in.eventAt(userID, userAgent, time.Now().UTC())
}

func (in clientErrorInput) eventAt(userID *uuid.UUID, userAgent string, now time.Time) (Event, error) {
	in.Kind = strings.TrimSpace(in.Kind)
	in.Name = strings.TrimSpace(in.Name)
	in.Message = strings.TrimSpace(in.Message)
	in.PagePath = strings.TrimSpace(in.PagePath)
	in.RequestMethod = strings.TrimSpace(in.RequestMethod)
	in.RequestPath = strings.TrimSpace(in.RequestPath)
	in.RequestID = strings.TrimSpace(in.RequestID)
	in.AppVersion = strings.TrimSpace(in.AppVersion)
	in.Locale = strings.TrimSpace(in.Locale)
	in.TimeZone = strings.TrimSpace(in.TimeZone)
	if !validFrontendKinds[in.Kind] || len(in.Message) == 0 || len(in.Message) > 4000 {
		return Event{}, errors.New("client error fields are invalid")
	}
	if len(in.Name) > 128 || len(in.StackTrace) > 16000 || len(in.ComponentStack) > 16000 || len(in.PagePath) > 512 || len(in.RequestMethod) > 16 || len(in.RequestPath) > 512 || len(in.RequestID) > 128 || len(in.AppVersion) > 128 || len(in.Locale) > 64 || len(in.TimeZone) > 128 {
		return Event{}, errors.New("client error fields are invalid")
	}
	if in.PagePath != "" && (!strings.HasPrefix(in.PagePath, "/") || strings.ContainsAny(in.PagePath, "?#")) {
		return Event{}, errors.New("client error page path is invalid")
	}
	if in.RequestPath != "" && (!strings.HasPrefix(in.RequestPath, "/") || strings.ContainsAny(in.RequestPath, "?#")) {
		return Event{}, errors.New("client error request path is invalid")
	}
	if in.RequestMethod != "" {
		in.RequestMethod = strings.ToUpper(in.RequestMethod)
	}
	if in.StatusCode != nil && (*in.StatusCode < 100 || *in.StatusCode > 599) {
		return Event{}, errors.New("client error status is invalid")
	}
	if in.ViewportWidth != nil && (*in.ViewportWidth < 0 || *in.ViewportWidth > 10000) {
		return Event{}, errors.New("client error viewport is invalid")
	}
	if in.ViewportHeight != nil && (*in.ViewportHeight < 0 || *in.ViewportHeight > 10000) {
		return Event{}, errors.New("client error viewport is invalid")
	}
	if in.OccurredAt != nil {
		occurredAt := in.OccurredAt.UTC()
		now = now.UTC()
		if occurredAt.IsZero() || occurredAt.Before(now.Add(-30*24*time.Hour)) || occurredAt.After(now.Add(24*time.Hour)) {
			return Event{}, errors.New("client error timestamp is invalid")
		}
		in.OccurredAt = &occurredAt
	}
	return Event{
		Source:         SourceFrontend,
		Kind:           in.Kind,
		UserID:         userID,
		OccurredAt:     in.OccurredAt,
		ErrorName:      in.Name,
		Message:        in.Message,
		StackTrace:     in.StackTrace,
		ComponentStack: in.ComponentStack,
		PagePath:       in.PagePath,
		RequestMethod:  in.RequestMethod,
		RequestPath:    in.RequestPath,
		RequestID:      in.RequestID,
		StatusCode:     in.StatusCode,
		AppVersion:     in.AppVersion,
		Locale:         in.Locale,
		TimeZone:       in.TimeZone,
		ViewportWidth:  in.ViewportWidth,
		ViewportHeight: in.ViewportHeight,
		Online:         in.Online,
		UserAgent:      userAgent,
	}, nil
}

func redactText(value string) string {
	return queryPattern.ReplaceAllString(emailPattern.ReplaceAllString(value, "[redacted-email]"), "$1[redacted-query]")
}

type RateLimiter struct {
	mu      sync.Mutex
	entries map[string]rateLimitEntry
	now     func() time.Time
	limit   int
	window  time.Duration
}

type rateLimitEntry struct {
	started time.Time
	count   int
}

func NewRateLimiter() *RateLimiter {
	return &RateLimiter{
		entries: make(map[string]rateLimitEntry),
		now:     time.Now,
		limit:   60,
		window:  time.Minute,
	}
}

func (l *RateLimiter) Allow(key string) bool {
	if l == nil {
		return true
	}
	l.mu.Lock()
	defer l.mu.Unlock()
	if l.entries == nil {
		l.entries = make(map[string]rateLimitEntry)
	}
	if l.now == nil {
		l.now = time.Now
	}
	if l.limit <= 0 {
		l.limit = 60
	}
	if l.window <= 0 {
		l.window = time.Minute
	}
	now := l.now()
	if len(l.entries) > 4096 {
		for entryKey, entry := range l.entries {
			if now.Sub(entry.started) >= l.window {
				delete(l.entries, entryKey)
			}
		}
	}
	entry, ok := l.entries[key]
	if !ok || now.Sub(entry.started) >= l.window {
		l.entries[key] = rateLimitEntry{started: now, count: 1}
		return true
	}
	if entry.count >= l.limit {
		return false
	}
	entry.count++
	l.entries[key] = entry
	return true
}

type Handler struct {
	Recorder Recorder
	Logger   *slog.Logger
	Limiter  *RateLimiter
	Now      func() time.Time
}

func (h Handler) logger() *slog.Logger {
	if h.Logger != nil {
		return h.Logger
	}
	return slog.Default()
}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now().UTC()
	}
	return time.Now().UTC()
}

func (h Handler) Register(mux *http.ServeMux, optionalAuth func(http.Handler) http.Handler) {
	handler := http.Handler(http.HandlerFunc(h.clientErrors))
	if optionalAuth != nil {
		handler = optionalAuth(handler)
	}
	mux.Handle("/api/v1/client-errors", handler)
}

func (h Handler) clientErrors(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method_not_allowed", "Method is not allowed.")
		return
	}
	if h.Limiter != nil && !h.Limiter.Allow(remoteAddress(r)) {
		w.Header().Set("Retry-After", "60")
		writeError(w, http.StatusTooManyRequests, "rate_limited", "Too many error reports.")
		return
	}
	var input clientErrorInput
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	if err := decoder.Decode(&input); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_client_error", "Error report is invalid.")
		return
	}
	var trailing struct{}
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeError(w, http.StatusUnprocessableEntity, "invalid_client_error", "Error report is invalid.")
		return
	}
	var userID *uuid.UUID
	if user, ok := auth.UserFromContext(r.Context()); ok {
		userID = &user.ID
	}
	event, err := input.eventAt(userID, r.UserAgent(), h.now())
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_client_error", "Error report is invalid.")
		return
	}
	if h.Recorder != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		recordErr := h.Recorder.Record(ctx, event)
		cancel()
		if recordErr != nil {
			h.logger().Error("client error event persistence failed", "request_id", r.Header.Get("X-Request-ID"), "error", recordErr)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func remoteAddress(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil && host != "" {
		return host
	}
	if r.RemoteAddr == "" {
		return "unknown"
	}
	return r.RemoteAddr
}

func BackendHTTPEvent(r *http.Request, status int) Event {
	userID := userIDFromContext(r)
	return Event{
		Source:        SourceBackend,
		Kind:          KindHTTP5xx,
		UserID:        userID,
		Message:       "Backend returned an internal error response.",
		PagePath:      r.URL.Path,
		RequestMethod: r.Method,
		RequestPath:   r.URL.Path,
		RequestID:     r.Header.Get("X-Request-ID"),
		StatusCode:    &status,
		UserAgent:     r.UserAgent(),
	}
}

func BackendPanicEvent(r *http.Request, value any, stack string) Event {
	userID := userIDFromContext(r)
	return Event{
		Source:        SourceBackend,
		Kind:          KindPanic,
		UserID:        userID,
		ErrorName:     "panic",
		Message:       panicMessage(value),
		StackTrace:    truncate(stack, 16000),
		PagePath:      r.URL.Path,
		RequestMethod: r.Method,
		RequestPath:   r.URL.Path,
		RequestID:     r.Header.Get("X-Request-ID"),
		StatusCode:    intPtr(http.StatusInternalServerError),
		UserAgent:     r.UserAgent(),
	}
}

func userIDFromContext(r *http.Request) *uuid.UUID {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		return nil
	}
	return &user.ID
}

func panicMessage(value any) string {
	message := strings.TrimSpace(strings.ReplaceAll(strings.TrimSpace(toString(value)), "\x00", ""))
	if message == "" {
		return "Backend panic recovered."
	}
	if len(message) > 4000 {
		return message[:4000]
	}
	return message
}

func truncate(value string, max int) string {
	if len(value) <= max {
		return value
	}
	return value[:max]
}

func toString(value any) string {
	if value == nil {
		return "nil"
	}
	if err, ok := value.(error); ok {
		return err.Error()
	}
	return strings.TrimSpace(strings.ReplaceAll(strings.TrimSpace(stringify(value)), "\n", " "))
}

func stringify(value any) string {
	data, err := json.Marshal(value)
	if err == nil && string(data) != "null" {
		return string(data)
	}
	return "panic value"
}

func intPtr(value int) *int {
	return &value
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}},
	})
}
