package attendance

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	DB            *pgxpool.Pool
	Notifications notification.Publisher
	Now           func() time.Time
	GracePeriod   time.Duration
}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now().UTC()
	}
	return time.Now().UTC()
}
func (h Handler) Register(mux *http.ServeMux, requireAuth, requireAdmin func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/games/{gameId}/attendance", requireAuth(http.HandlerFunc(h.gameRoutes)))
	mux.Handle("/api/v1/me/reliability", requireAuth(http.HandlerFunc(h.myReliability)))
	mux.Handle("/api/v1/admin/reliability/", requireAdmin(http.HandlerFunc(h.adminReliability)))
}
func (h Handler) gameRoutes(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/games/"), "/"), "/")
	if len(parts) != 2 || parts[1] != "attendance" {
		writeError(w, 404, "not_found", "Attendance not found.")
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		h.list(w, r, id, u)
	case http.MethodPut:
		h.record(w, r, id, u)
	default:
		w.WriteHeader(405)
	}
}

type attendanceEntry struct {
	UserID      uuid.UUID  `json:"userId"`
	DisplayName string     `json:"displayName"`
	Status      Status     `json:"status"`
	RecordedAt  *time.Time `json:"recordedAt,omitempty"`
}

func (h Handler) canView(ctx context.Context, gameID, userID uuid.UUID) (bool, bool, error) {
	var organizer, admin bool
	err := h.DB.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2 AND role='organizer'), EXISTS(SELECT 1 FROM users WHERE id=$2 AND is_admin=true)`, gameID, userID).Scan(&organizer, &admin)
	if err != nil {
		return false, false, err
	}
	return organizer || admin, organizer, nil
}
func (h Handler) list(w http.ResponseWriter, r *http.Request, gameID uuid.UUID, u auth.User) {
	view, _, err := h.canView(r.Context(), gameID, u.ID)
	if err != nil {
		http.Error(w, "attendance unavailable", 500)
		return
	}
	if !view {
		var member bool
		err = h.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2 AND status IN ('confirmed','cancelled'))`, gameID, u.ID).Scan(&member)
		if err != nil || !member {
			writeError(w, 403, "forbidden", "Attendance access required.")
			return
		}
	}
	rows, err := h.DB.Query(r.Context(), `SELECT gp.user_id,u.display_name,COALESCE(gp.attendance_status,'unknown'),gp.attendance_recorded_at FROM game_players gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=$1 AND gp.status='confirmed' ORDER BY gp.joined_at`, gameID)
	if err != nil {
		http.Error(w, "attendance unavailable", 500)
		return
	}
	defer rows.Close()
	out := []attendanceEntry{}
	for rows.Next() {
		var x attendanceEntry
		if err := rows.Scan(&x.UserID, &x.DisplayName, &x.Status, &x.RecordedAt); err != nil {
			http.Error(w, "attendance unavailable", 500)
			return
		}
		out = append(out, x)
	}
	writeJSON(w, 200, out)
}
func (h Handler) record(w http.ResponseWriter, r *http.Request, gameID uuid.UUID, u auth.User) {
	var in struct {
		UserID uuid.UUID `json:"userId"`
		Status Status    `json:"status"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in) != nil || in.UserID == uuid.Nil || (in.Status != Unknown && in.Status != Attended && in.Status != NoShow) {
		writeError(w, 422, "invalid_attendance", "Attendance input is invalid.")
		return
	}
	admin, organizer, err := h.canView(r.Context(), gameID, u.ID)
	if err != nil {
		http.Error(w, "attendance unavailable", 500)
		return
	}
	if !admin && !organizer && in.UserID != u.ID {
		writeError(w, 403, "forbidden", "Only participants can confirm their attendance.")
		return
	}
	if !admin && !organizer && in.Status == NoShow {
		writeError(w, 403, "forbidden", "Participants may confirm attendance or unknown status.")
		return
	}
	tag, err := h.DB.Exec(r.Context(), `UPDATE game_players SET attendance_status=$1,attendance_recorded_at=now(),attendance_recorded_by_user_id=$2 WHERE game_id=$3 AND user_id=$4 AND status='confirmed'`, in.Status, u.ID, gameID, in.UserID)
	if err != nil {
		http.Error(w, "attendance unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "participant_not_found", "Confirmed participant not found.")
		return
	}
	w.WriteHeader(204)
}
func (h Handler) myReliability(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	h.reliability(w, r, u.ID, false)
}
func (h Handler) adminReliability(w http.ResponseWriter, r *http.Request) {
	id, err := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/reliability/"), "/"))
	if err != nil {
		writeError(w, 404, "user_not_found", "User not found.")
		return
	}
	h.reliability(w, r, id, true)
}
func (h Handler) reliability(w http.ResponseWriter, r *http.Request, id uuid.UUID, admin bool) {
	var c [5]int
	err := h.DB.QueryRow(r.Context(), `SELECT count(*) FILTER(WHERE gp.status='confirmed' AND g.status IN ('completed','cancelled')),count(*) FILTER(WHERE gp.attendance_status='attended' AND g.status='completed'),count(*) FILTER(WHERE gp.cancellation_type='early'),count(*) FILTER(WHERE gp.cancellation_type='late'),count(*) FILTER(WHERE gp.cancellation_type='no_show') FROM game_players gp JOIN games g ON g.id=gp.game_id WHERE gp.user_id=$1`, id).Scan(&c[0], &c[1], &c[2], &c[3], &c[4])
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "reliability unavailable", 500)
		return
	}
	writeJSON(w, 200, Summary(c[0], c[1], c[2], c[3], c[4]))
}

func CompleteFinishedGames(ctx context.Context, db *pgxpool.Pool, publisher notification.Publisher, now time.Time, grace time.Duration) (int, error) {
	if grace < 0 {
		grace = 0
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	rows, err := tx.Query(ctx, `SELECT id,created_by_user_id FROM games WHERE status='scheduled' AND ends_at <= $1 AND completed_at IS NULL FOR UPDATE SKIP LOCKED`, now.UTC().Add(-grace))
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	type item struct{ id, user uuid.UUID }
	items := []item{}
	for rows.Next() {
		var x item
		if err := rows.Scan(&x.id, &x.user); err != nil {
			return 0, err
		}
		items = append(items, x)
	}
	if err = rows.Err(); err != nil {
		return 0, err
	}
	rows.Close()
	for _, x := range items {
		if _, err = tx.Exec(ctx, `UPDATE games SET status='completed',completed_at=$2,attendance_requested_at=COALESCE(attendance_requested_at,$2),updated_at=$2 WHERE id=$1 AND status='scheduled'`, x.id, now.UTC()); err != nil {
			return 0, err
		}
	}
	if err = tx.Commit(ctx); err != nil {
		return 0, err
	}
	if publisher != nil {
		const title = "Registre a presença"
		const body = "Seu jogo foi completo. Registre a presença dos jogadores."
		for _, x := range items {
			_ = publisher.Publish(ctx, notification.EventInput{UserID: x.user, Type: notification.AttendanceRequested, Title: title, Body: body, ActionURL: "/games/" + x.id.String() + "/attendance", Payload: map[string]string{"gameId": x.id.String()}})
		}
	}
	return len(items), nil
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": msg, "fields": map[string]string{}}})
}
