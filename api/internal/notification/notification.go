package notification

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/platform/email"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Type string

const (
	Welcome              Type = "welcome"
	MatchProposal        Type = "match_proposal"
	ProposalConfirmed    Type = "proposal_confirmed"
	ProposalExpired      Type = "proposal_expired"
	ManualGameInvitation Type = "manual_game_invitation"
	UserJoinedGame       Type = "user_joined_game"
	UserLeftGame         Type = "user_left_game"
	WaitlistPromotion    Type = "waitlist_promotion"
	GameChanged          Type = "game_changed"
	GameCancelled        Type = "game_cancelled"
	GameReminder         Type = "game_reminder"
	ReportReceived       Type = "report_received"
)

type Event struct {
	ID, UserID        uuid.UUID
	Type              Type
	Title, Body       string
	ActionURL         *string
	Payload           json.RawMessage
	ReadAt, CreatedAt *time.Time
}
type Delivery struct {
	ID, EventID            uuid.UUID
	UserID                 uuid.UUID
	Channel, Status        string
	AttemptCount           int
	Title, Body, ActionURL string
	Payload                json.RawMessage
}
type NotificationChannel interface {
	Send(context.Context, Delivery) error
}
type Publisher interface {
	Publish(context.Context, EventInput) error
}
type EventInput struct {
	UserID                 uuid.UUID
	Type                   Type
	Title, Body, ActionURL string
	Payload                any
}
type Service struct {
	DB       *pgxpool.Pool
	Email    email.Sender
	Channels map[string]NotificationChannel
}

func (s Service) Publish(ctx context.Context, input EventInput) error {
	payload, err := json.Marshal(input.Payload)
	if err != nil {
		return err
	}
	eventID := uuid.New()
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO notification_events (id,user_id,type,title,body,action_url,payload) VALUES ($1,$2,$3,$4,$5,NULLIF($6,''),$7)`, eventID, input.UserID, input.Type, input.Title, input.Body, input.ActionURL, payload)
	if err != nil {
		return err
	}
	for _, channel := range []string{"in_app", "email", "web_push"} {
		if _, err = tx.Exec(ctx, `INSERT INTO notification_deliveries (id,notification_event_id,channel) VALUES ($1,$2,$3)`, uuid.New(), eventID, channel); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s Service) Register(mux *http.ServeMux, requireAuth func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/notifications", requireAuth(http.HandlerFunc(s.list)))
	mux.Handle("/api/v1/notifications/", requireAuth(http.HandlerFunc(s.action)))
}

func (s Service) list(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required.")
		return
	}
	limit := 30
	if raw := r.URL.Query().Get("limit"); raw != "" {
		value, err := strconv.Atoi(raw)
		if err != nil || value < 1 || value > 100 {
			writeError(w, http.StatusUnprocessableEntity, "invalid_limit", "Limit must be between 1 and 100.")
			return
		}
		limit = value
	}
	rows, err := s.DB.Query(r.Context(), `SELECT id,user_id,type,title,body,action_url,payload,read_at,created_at FROM notification_events WHERE user_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2`, user.ID, limit+1)
	if err != nil {
		http.Error(w, "failed to load notifications", http.StatusInternalServerError)
		return
	}
	defer rows.Close()
	items := make([]Event, 0, limit)
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.UserID, &e.Type, &e.Title, &e.Body, &e.ActionURL, &e.Payload, &e.ReadAt, &e.CreatedAt); err != nil {
			http.Error(w, "failed to load notifications", http.StatusInternalServerError)
			return
		}
		items = append(items, e)
	}
	hasMore := len(items) > limit
	if hasMore {
		items = items[:limit]
	}
	unread := 0
	_ = s.DB.QueryRow(r.Context(), `SELECT count(*) FROM notification_events WHERE user_id=$1 AND read_at IS NULL`, user.ID).Scan(&unread)
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "unreadCount": unread, "hasMore": hasMore})
}

func (s Service) action(w http.ResponseWriter, r *http.Request) {
	user, ok := auth.UserFromContext(r.Context())
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required.")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/notifications/")
	if path == "read-all" {
		if _, err := s.DB.Exec(r.Context(), `UPDATE notification_events SET read_at=COALESCE(read_at,now()) WHERE user_id=$1`, user.ID); err != nil {
			http.Error(w, "failed to update notifications", 500)
			return
		}
		w.WriteHeader(http.StatusNoContent)
		return
	}
	id, err := uuid.Parse(strings.TrimSuffix(path, "/read"))
	if err != nil || !strings.HasSuffix(r.URL.Path, "/read") {
		writeError(w, http.StatusNotFound, "not_found", "Notification not found.")
		return
	}
	result, err := s.DB.Exec(r.Context(), `UPDATE notification_events SET read_at=COALESCE(read_at,now()) WHERE id=$1 AND user_id=$2`, id, user.ID)
	if err != nil {
		http.Error(w, "failed to update notification", 500)
		return
	}
	if result.RowsAffected() == 0 {
		writeError(w, http.StatusNotFound, "not_found", "Notification not found.")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s Service) Deliver(ctx context.Context, delivery Delivery) error {
	channel, ok := s.Channels[delivery.Channel]
	if !ok {
		return fmt.Errorf("notification channel %q unavailable", delivery.Channel)
	}
	return channel.Send(ctx, delivery)
}

type InAppChannel struct{ DB *pgxpool.Pool }

func (c InAppChannel) Send(ctx context.Context, d Delivery) error {
	_, err := c.DB.Exec(ctx, `UPDATE notification_deliveries SET status='delivered',delivered_at=now(),last_attempt_at=now(),attempt_count=attempt_count+1 WHERE id=$1 AND status IN ('pending','processing')`, d.ID)
	return err
}

type EmailChannel struct{ Sender email.Sender }

func (c EmailChannel) Send(context.Context, Delivery) error {
	if c.Sender == nil {
		return errors.New("email sender unavailable")
	}
	return errors.New("email recipient resolution required")
}

type WebPushChannel struct{}

func (WebPushChannel) Send(context.Context, Delivery) error {
	return errors.New("web push provider unavailable")
}

func EndpointHash(endpoint string) string {
	sum := sha256.Sum256([]byte(endpoint))
	return hex.EncodeToString(sum[:])
}
func ReminderTimes(gameStart, now time.Time) []time.Time {
	result := []time.Time{}
	for _, d := range []time.Duration{24 * time.Hour, 2 * time.Hour} {
		at := gameStart.Add(-d)
		if at.After(now) {
			result = append(result, at)
		}
	}
	return result
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}}})
}
