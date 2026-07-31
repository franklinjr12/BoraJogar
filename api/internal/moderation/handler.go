package moderation

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"github.com/borajogar/borajogar/api/internal/attendance"
	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"net/http"
	"strings"
	"time"
)

type Handler struct {
	DB            *pgxpool.Pool
	Notifications notification.Publisher
	Now           func() time.Time
}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now().UTC()
	}
	return time.Now().UTC()
}
func (h Handler) Register(mux *http.ServeMux, requireAuth, requireAdmin func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/users/", requireAuth(http.HandlerFunc(h.userRoutes)))
	mux.Handle("/api/v1/me/blocked-users", requireAuth(http.HandlerFunc(h.blocks)))
	mux.Handle("/api/v1/me/delete", requireAuth(http.HandlerFunc(h.deleteAccount)))
	mux.Handle("/api/v1/reports", requireAuth(http.HandlerFunc(h.createReport)))
	mux.Handle("/api/v1/reports/", requireAuth(http.HandlerFunc(h.myReport)))
	mux.Handle("/api/v1/admin/reports", requireAdmin(http.HandlerFunc(h.adminReports)))
	mux.Handle("/api/v1/admin/reports/", requireAdmin(http.HandlerFunc(h.reviewReport)))
}
func (h Handler) userRoutes(w http.ResponseWriter, r *http.Request) {
	p := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/users/"), "/"), "/")
	if len(p) != 2 || p[1] != "block" {
		fail(w, 404, "not_found", "Resource not found.")
		return
	}
	id, e := uuid.Parse(p[0])
	u, _ := auth.UserFromContext(r.Context())
	if e != nil || id == u.ID {
		fail(w, 422, "invalid_block", "User id is invalid.")
		return
	}
	if r.Method == http.MethodPost {
		var ok bool
		e = h.DB.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND status='active' AND deleted_at IS NULL)`, id).Scan(&ok)
		if e != nil || !ok {
			fail(w, 404, "user_not_found", "User not found.")
			return
		}
		_, e = h.DB.Exec(r.Context(), `INSERT INTO user_blocks(blocker_user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, u.ID, id)
		if e != nil {
			http.Error(w, "block unavailable", 500)
			return
		}
		w.WriteHeader(204)
		return
	}
	if r.Method == http.MethodDelete {
		tag, e := h.DB.Exec(r.Context(), `DELETE FROM user_blocks WHERE blocker_user_id=$1 AND blocked_user_id=$2`, u.ID, id)
		if e != nil {
			http.Error(w, "block unavailable", 500)
			return
		}
		if tag.RowsAffected() == 0 {
			fail(w, 404, "block_not_found", "Block not found.")
			return
		}
		w.WriteHeader(204)
		return
	}
	w.WriteHeader(405)
}
func (h Handler) blocks(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	rows, e := h.DB.Query(r.Context(), `SELECT u.id,u.display_name,b.created_at FROM user_blocks b JOIN users u ON u.id=b.blocked_user_id WHERE b.blocker_user_id=$1 ORDER BY b.created_at DESC`, u.ID)
	if e != nil {
		http.Error(w, "blocks unavailable", 500)
		return
	}
	defer rows.Close()
	type item struct {
		UserID      uuid.UUID `json:"userId"`
		DisplayName string    `json:"displayName"`
		CreatedAt   time.Time `json:"createdAt"`
	}
	out := []item{}
	for rows.Next() {
		var x item
		if e = rows.Scan(&x.UserID, &x.DisplayName, &x.CreatedAt); e != nil {
			http.Error(w, "blocks unavailable", 500)
			return
		}
		out = append(out, x)
	}
	write(w, 200, out)
}

type reportInput struct {
	ReportedUserID        *uuid.UUID `json:"reportedUserId"`
	GameID                *uuid.UUID `json:"gameId"`
	Category, Description string
	BlockReportedUser     bool `json:"blockReportedUser"`
}

var validCategory = map[string]bool{"harassment": true, "unsafe_behavior": true, "repeated_no_show": true, "false_profile": true, "inappropriate_content": true, "other": true}

func (h Handler) createReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	var in reportInput
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in) != nil || !validCategory[in.Category] || len(strings.TrimSpace(in.Description)) < 1 || len(in.Description) > 2000 {
		fail(w, 422, "invalid_report", "Report data is invalid.")
		return
	}
	tx, e := h.DB.Begin(r.Context())
	if e != nil {
		http.Error(w, "report unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	id := uuid.New()
	_, e = tx.Exec(r.Context(), `INSERT INTO reports(id,reporter_user_id,reported_user_id,game_id,category,description) VALUES($1,$2,$3,$4,$5,$6)`, id, u.ID, in.ReportedUserID, in.GameID, in.Category, strings.TrimSpace(in.Description))
	if e == nil && in.BlockReportedUser && in.ReportedUserID != nil && *in.ReportedUserID != u.ID {
		_, e = tx.Exec(r.Context(), `INSERT INTO user_blocks(blocker_user_id,blocked_user_id) VALUES($1,$2) ON CONFLICT DO NOTHING`, u.ID, *in.ReportedUserID)
	}
	if e != nil {
		http.Error(w, "report unavailable", 500)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		http.Error(w, "report unavailable", 500)
		return
	}
	write(w, 201, map[string]any{"id": id, "status": "open"})
}
func (h Handler) myReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	id, e := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/reports/"), "/"))
	if e != nil {
		fail(w, 404, "report_not_found", "Report not found.")
		return
	}
	var out map[string]any
	var category, description, status string
	var created time.Time
	e = h.DB.QueryRow(r.Context(), `SELECT category,description,status,created_at FROM reports WHERE id=$1 AND reporter_user_id=$2`, id, u.ID).Scan(&category, &description, &status, &created)
	if e != nil {
		fail(w, 404, "report_not_found", "Report not found.")
		return
	}
	out = map[string]any{"id": id, "category": category, "description": description, "status": status, "createdAt": created}
	write(w, 200, out)
}
func (h Handler) adminReports(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	rows, e := h.DB.Query(r.Context(), `SELECT id,reporter_user_id,reported_user_id,game_id,category,description,status,created_at FROM reports ORDER BY created_at DESC LIMIT 100`)
	if e != nil {
		http.Error(w, "reports unavailable", 500)
		return
	}
	defer rows.Close()
	type item struct {
		ID, ReporterUserID            uuid.UUID
		ReportedUserID, GameID        *uuid.UUID
		Category, Description, Status string
		CreatedAt                     time.Time
	}
	out := []item{}
	for rows.Next() {
		var x item
		if e = rows.Scan(&x.ID, &x.ReporterUserID, &x.ReportedUserID, &x.GameID, &x.Category, &x.Description, &x.Status, &x.CreatedAt); e != nil {
			http.Error(w, "reports unavailable", 500)
			return
		}
		out = append(out, x)
	}
	write(w, 200, out)
}
func (h Handler) reviewReport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	id, e := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/reports/"), "/"))
	var in struct {
		Status          string  `json:"status"`
		ResolutionNotes *string `json:"resolutionNotes"`
	}
	if e != nil || json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in) != nil || (in.Status != "investigating" && in.Status != "resolved" && in.Status != "dismissed") {
		fail(w, 422, "invalid_report_status", "Report status is invalid.")
		return
	}
	tag, e := h.DB.Exec(r.Context(), `UPDATE reports SET status=$1,resolution_notes=$2,reviewed_at=now(),reviewed_by_user_id=$3 WHERE id=$4`, in.Status, in.ResolutionNotes, u.ID, id)
	if e != nil {
		http.Error(w, "reports unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		fail(w, 404, "report_not_found", "Report not found.")
		return
	}
	w.WriteHeader(204)
}
func (h Handler) deleteAccount(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost && r.Method != http.MethodDelete {
		w.WriteHeader(405)
		return
	}
	u, _ := auth.UserFromContext(r.Context())
	tx, e := h.DB.Begin(r.Context())
	if e != nil {
		http.Error(w, "account unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	now := h.now()
	_, e = tx.Exec(r.Context(), `UPDATE game_players gp SET status='cancelled',cancelled_at=$2,cancellation_type=CASE WHEN g.starts_at <= $2 THEN 'no_show' WHEN g.starts_at-$2 < interval '6 hours' THEN 'late' ELSE 'early' END,cancellation_threshold_minutes=$3 FROM games g WHERE g.id=gp.game_id AND gp.user_id=$1 AND gp.status='confirmed' AND g.status='scheduled' AND g.starts_at>$2`, u.ID, now, int(attendance.LateCancellationThreshold/time.Minute))
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM proposal_participants WHERE user_id=$1 AND EXISTS(SELECT 1 FROM match_proposals p WHERE p.id=proposal_id AND p.starts_at>$2 AND p.status='pending')`, u.ID, now)
	}
	sum := sha256.Sum256([]byte(u.ID.String() + now.String()))
	anon := "deleted-" + hex.EncodeToString(sum[:8])
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE users SET status='deleted',display_name=$2,email=$3,deleted_at=$4,deletion_requested_at=$4 WHERE id=$1`, u.ID, anon, anon+"@deleted.invalid", now)
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `UPDATE player_profiles SET active_for_matchmaking=false,updated_at=$2 WHERE user_id=$1`, u.ID, now)
	}
	if e == nil {
		_, e = tx.Exec(r.Context(), `DELETE FROM sessions WHERE user_id=$1`, u.ID)
	}
	if e != nil {
		http.Error(w, "account unavailable", 500)
		return
	}
	if e = tx.Commit(r.Context()); e != nil {
		http.Error(w, "account unavailable", 500)
		return
	}
	w.WriteHeader(204)
}
func write(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func fail(w http.ResponseWriter, status int, code, msg string) {
	write(w, status, map[string]any{"error": map[string]any{"code": code, "message": msg, "fields": map[string]string{}}})
}
