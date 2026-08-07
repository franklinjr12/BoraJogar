package httpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"runtime/debug"
	"time"

	"github.com/borajogar/borajogar/api/internal/admin"
	"github.com/borajogar/borajogar/api/internal/attendance"
	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/availability"
	"github.com/borajogar/borajogar/api/internal/game"
	"github.com/borajogar/borajogar/api/internal/location"
	"github.com/borajogar/borajogar/api/internal/moderation"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/borajogar/borajogar/api/internal/platform/metrics"
	"github.com/borajogar/borajogar/api/internal/profile"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type key string

const requestIDKey key = "request_id"

func New(logger *slog.Logger, db *pgxpool.Pool, authHandlers ...auth.Handler) http.Handler {
	return NewWithMetrics(logger, db, &metrics.Metrics{}, authHandlers...)
}

func NewWithGoogleMaps(logger *slog.Logger, db *pgxpool.Pool, googleMapsAPIKey string, authHandlers ...auth.Handler) http.Handler {
	return newWithMetrics(logger, db, &metrics.Metrics{}, googleMapsAPIKey, authHandlers...)
}

func NewWithMetrics(logger *slog.Logger, db *pgxpool.Pool, requestMetrics *metrics.Metrics, authHandlers ...auth.Handler) http.Handler {
	return newWithMetrics(logger, db, requestMetrics, "", authHandlers...)
}

func newWithMetrics(logger *slog.Logger, db *pgxpool.Pool, requestMetrics *metrics.Metrics, googleMapsAPIKey string, authHandlers ...auth.Handler) http.Handler {
	mux := http.NewServeMux()
	for _, authHandler := range authHandlers {
		authHandler.Register(mux)
		profile.Handler{DB: db}.Register(mux, authHandler.RequireAuth)
		location.Handler{DB: db, GoogleMapsAPIKey: googleMapsAPIKey}.Register(mux, authHandler.RequireAuth, authHandler.RequireAdmin)
		availability.Handler{DB: db}.Register(mux, authHandler.RequireAuth)
		notification.Service{DB: db}.Register(mux, authHandler.RequireAuth)
		publisher := notification.Service{DB: db}
		game.Handler{DB: db, Notifications: publisher}.Register(mux, authHandler.RequireAuth)
		attendance.Handler{DB: db, Notifications: publisher}.Register(mux, authHandler.RequireAuth, authHandler.RequireAdmin)
		moderation.Handler{DB: db, Notifications: publisher}.Register(mux, authHandler.RequireAuth, authHandler.RequireAdmin)
		admin.Handler{DB: db, Metrics: requestMetrics}.Register(mux, authHandler.RequireAdmin)
	}
	mux.HandleFunc("GET /health/live", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	})
	mux.HandleFunc("GET /health/ready", func(w http.ResponseWriter, r *http.Request) {
		if db == nil || db.Ping(r.Context()) != nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		var migrationsReady bool
		if err := db.QueryRow(r.Context(), `SELECT COALESCE(MAX(version_id), 0) >= 11 FROM goose_db_version WHERE is_applied`).Scan(&migrationsReady); err != nil || !migrationsReady {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "not_ready"})
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
	})
	return secureHeaders(recoverer(logger, requestLogger(logger, requestMetrics, requestID(mux))))
}

func secureHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "same-origin")
		if r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead {
			r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		}
		next.ServeHTTP(w, r)
	})
}

func requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		w.Header().Set("X-Request-ID", id)
		request := r.WithContext(context.WithValue(r.Context(), requestIDKey, id))
		request.Header.Set("X-Request-ID", id)
		next.ServeHTTP(&requestIDWriter{ResponseWriter: w, requestID: id}, request)
	})
}

type requestIDWriter struct {
	http.ResponseWriter
	requestID string
	status    int
}

func (w *requestIDWriter) WriteHeader(status int) {
	w.status = status
	if status != http.StatusUnauthorized && status != http.StatusForbidden && status < 400 {
		w.ResponseWriter.WriteHeader(status)
	}
}

func (w *requestIDWriter) Write(body []byte) (int, error) {
	if w.status >= 400 {
		if w.Header().Get("Content-Type") == "application/json" {
			var payload map[string]any
			if json.Unmarshal(body, &payload) == nil {
				payload["requestId"] = w.requestID
				body, _ = json.Marshal(payload)
			}
		}
		w.ResponseWriter.WriteHeader(w.status)
	}
	return w.ResponseWriter.Write(body)
}
func requestLogger(logger *slog.Logger, requestMetrics *metrics.Metrics, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		started := time.Now()
		rw := &statusWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		requestMetrics.Observe(rw.status, time.Since(started))
		attrs := []any{"request_id", requestIDValue(r.Context()), "method", r.Method, "route", r.URL.Path, "status", rw.status, "duration_ms", time.Since(started).Milliseconds()}
		if user, ok := auth.UserFromContext(r.Context()); ok {
			attrs = append(attrs, "user_id", user.ID)
		}
		logger.Info("http request", attrs...)
	})
}
func recoverer(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if value := recover(); value != nil {
				logger.Error("panic recovered", "request_id", requestIDValue(r.Context()), "panic", value, "stack", string(debug.Stack()))
				writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "internal server error"})
			}
		}()
		next.ServeHTTP(w, r)
	})
}
func requestIDValue(ctx context.Context) string {
	id, ok := ctx.Value(requestIDKey).(string)
	if !ok {
		return ""
	}
	return id
}

type statusWriter struct {
	http.ResponseWriter
	status int
}

func (w *statusWriter) WriteHeader(status int) {
	w.status = status
	w.ResponseWriter.WriteHeader(status)
}
func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(body); err != nil {
		fmt.Fprintln(w, `{"error":"failed to encode response"}`)
	}
}
