package admin

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct{ DB *pgxpool.Pool }

func (h Handler) Register(mux *http.ServeMux, requireAdmin func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/admin/dashboard", requireAdmin(http.HandlerFunc(h.dashboard)))
	mux.Handle("/api/v1/admin/users", requireAdmin(http.HandlerFunc(h.users)))
	mux.Handle("/api/v1/admin/users/", requireAdmin(http.HandlerFunc(h.userAction)))
	mux.Handle("/api/v1/admin/matchmaking/runs", requireAdmin(http.HandlerFunc(h.runs)))
	mux.Handle("/api/v1/admin/venues", requireAdmin(http.HandlerFunc(h.venueCollection)))
	mux.Handle("/api/v1/admin/venues/", requireAdmin(http.HandlerFunc(h.venues)))
}

func (h Handler) venueCollection(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	var in struct {
		Name, Description, AddressLabel, City string
		Latitude, Longitude                   float64
		Active                                bool
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 32<<10)).Decode(&in) != nil || strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.City) == "" || in.Latitude < -90 || in.Latitude > 90 || in.Longitude < -180 || in.Longitude > 180 {
		writeError(w, 422, "invalid_venue", "Venue data is invalid.")
		return
	}
	id := uuid.New()
	_, err := h.DB.Exec(r.Context(), `INSERT INTO venues(id,name,description,address_label,city,location,active,approved_at) VALUES($1,$2,NULLIF($3,''),NULLIF($4,''),$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,CASE WHEN $8 THEN now() END)`, id, strings.TrimSpace(in.Name), in.Description, in.AddressLabel, strings.TrimSpace(in.City), in.Longitude, in.Latitude, in.Active)
	if err != nil {
		http.Error(w, "venue unavailable", 500)
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "active": in.Active})
}

func (h Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var out struct{ RegisteredUsers, OnboardingCompleted, ActiveMatchmakingUsers, ActiveVenues, PendingVenueSuggestions, PendingProposals, ConfirmedGames, CancelledGames, RecentReports, NotificationFailures int }
	err := h.DB.QueryRow(r.Context(), `SELECT (SELECT count(*) FROM users WHERE status='active'),(SELECT count(*) FROM users WHERE status='active' AND onboarding_completed),(SELECT count(*) FROM player_profiles WHERE active_for_matchmaking),(SELECT count(*) FROM venues WHERE active),(SELECT count(*) FROM venues WHERE active=false AND approved_at IS NULL AND rejected_at IS NULL),(SELECT count(*) FROM match_proposals WHERE status='pending'),(SELECT count(*) FROM games WHERE status='scheduled'),(SELECT count(*) FROM games WHERE status='cancelled'),(SELECT count(*) FROM reports WHERE status='open'),(SELECT count(*) FROM notification_deliveries WHERE status='failed')`).Scan(&out.RegisteredUsers, &out.OnboardingCompleted, &out.ActiveMatchmakingUsers, &out.ActiveVenues, &out.PendingVenueSuggestions, &out.PendingProposals, &out.ConfirmedGames, &out.CancelledGames, &out.RecentReports, &out.NotificationFailures)
	if err != nil {
		http.Error(w, "dashboard unavailable", 500)
		return
	}
	writeJSON(w, 200, out)
}

type userItem struct {
	ID                  uuid.UUID `json:"id"`
	DisplayName         string    `json:"displayName"`
	Email               string    `json:"email"`
	Status              string    `json:"status"`
	OnboardingCompleted bool      `json:"onboardingCompleted"`
	IsAdmin             bool      `json:"isAdmin"`
	CreatedAt           time.Time `json:"createdAt"`
}

func (h Handler) users(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	q := "%" + strings.TrimSpace(r.URL.Query().Get("q")) + "%"
	rows, err := h.DB.Query(r.Context(), `SELECT id,display_name,email,status,onboarding_completed,is_admin,created_at FROM users WHERE display_name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 100`, q)
	if err != nil {
		http.Error(w, "users unavailable", 500)
		return
	}
	defer rows.Close()
	out := []userItem{}
	for rows.Next() {
		var x userItem
		if err := rows.Scan(&x.ID, &x.DisplayName, &x.Email, &x.Status, &x.OnboardingCompleted, &x.IsAdmin, &x.CreatedAt); err != nil {
			http.Error(w, "users unavailable", 500)
			return
		}
		out = append(out, x)
	}
	writeJSON(w, 200, out)
}
func (h Handler) userAction(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/users/"), "/"), "/")
	if len(parts) != 2 {
		writeError(w, 404, "not_found", "User action not found.")
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		writeError(w, 404, "user_not_found", "User not found.")
		return
	}
	var q string
	switch parts[1] {
	case "disable":
		q = `UPDATE users SET status='disabled',updated_at=now() WHERE id=$1 AND status<>'deleted'`
	case "enable":
		q = `UPDATE users SET status='active',updated_at=now() WHERE id=$1 AND status<>'deleted'`
	case "disable-matchmaking":
		q = `UPDATE player_profiles SET active_for_matchmaking=false,updated_at=now() WHERE user_id=$1`
	case "revoke-sessions":
		q = `DELETE FROM sessions WHERE user_id=$1`
	default:
		writeError(w, 404, "not_found", "User action not found.")
		return
	}
	tag, err := h.DB.Exec(r.Context(), q, id)
	if err != nil {
		http.Error(w, "user action unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "user_not_found", "User not found.")
		return
	}
	w.WriteHeader(204)
}
func (h Handler) runs(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(405)
		return
	}
	rows, err := h.DB.Query(r.Context(), `SELECT id,started_at,completed_at,status,candidate_slot_count,proposal_count,configuration_snapshot,error_summary FROM matchmaking_runs ORDER BY started_at DESC LIMIT 100`)
	if err != nil {
		http.Error(w, "runs unavailable", 500)
		return
	}
	defer rows.Close()
	type item struct {
		ID                                uuid.UUID       `json:"id"`
		StartedAt                         time.Time       `json:"startedAt"`
		CompletedAt                       *time.Time      `json:"completedAt,omitempty"`
		Status                            string          `json:"status"`
		CandidateSlotCount, ProposalCount int             `json:"candidateSlotCount"`
		ConfigurationSnapshot             json.RawMessage `json:"configurationSnapshot"`
		ErrorSummary                      json.RawMessage `json:"errorSummary,omitempty"`
	}
	out := []item{}
	for rows.Next() {
		var x item
		if err := rows.Scan(&x.ID, &x.StartedAt, &x.CompletedAt, &x.Status, &x.CandidateSlotCount, &x.ProposalCount, &x.ConfigurationSnapshot, &x.ErrorSummary); err != nil {
			http.Error(w, "runs unavailable", 500)
			return
		}
		out = append(out, x)
	}
	writeJSON(w, 200, out)
}
func (h Handler) venues(w http.ResponseWriter, r *http.Request) {
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/admin/venues/"), "/"), "/")
	if len(parts) == 2 && parts[1] == "disable" && r.Method == http.MethodPost {
		id, e := uuid.Parse(parts[0])
		if e != nil {
			writeError(w, 404, "venue_not_found", "Venue not found.")
			return
		}
		tag, e := h.DB.Exec(r.Context(), `UPDATE venues SET active=false,updated_at=now() WHERE id=$1`, id)
		if e != nil {
			http.Error(w, "venue unavailable", 500)
			return
		}
		if tag.RowsAffected() == 0 {
			writeError(w, 404, "venue_not_found", "Venue not found.")
			return
		}
		w.WriteHeader(204)
		return
	}
	if len(parts) != 2 || parts[1] != "merge" {
		w.WriteHeader(404)
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	source, err := uuid.Parse(parts[0])
	var in struct {
		TargetVenueID uuid.UUID `json:"targetVenueId"`
	}
	if err != nil || json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in) != nil || in.TargetVenueID == uuid.Nil {
		writeError(w, 422, "invalid_merge", "Target venue is required.")
		return
	}
	if source == in.TargetVenueID {
		writeError(w, 422, "invalid_merge", "Venues must differ.")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "venue merge unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	queries := []string{`INSERT INTO user_favorite_venues(user_id,venue_id,priority) SELECT user_id,$2,priority FROM user_favorite_venues WHERE venue_id=$1 ON CONFLICT(user_id,venue_id) DO NOTHING`, `DELETE FROM user_favorite_venues WHERE venue_id=$1`, `INSERT INTO availability_rule_venues(availability_rule_id,venue_id) SELECT availability_rule_id,$2 FROM availability_rule_venues WHERE venue_id=$1 ON CONFLICT DO NOTHING`, `DELETE FROM availability_rule_venues WHERE venue_id=$1`, `UPDATE games SET venue_id=$2 WHERE venue_id=$1 AND starts_at>now() AND status='scheduled'`, `UPDATE venues SET active=false,rejected_at=now(),updated_at=now() WHERE id=$1`}
	for i, q := range queries {
		if _, err = tx.Exec(r.Context(), q, source, in.TargetVenueID); err != nil {
			http.Error(w, "venue merge unavailable", 500)
			return
		}
		if i == 1 || i == 3 || i == 5 {
			_ = i
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "venue merge unavailable", 500)
		return
	}
	w.WriteHeader(204)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, msg string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": msg, "fields": map[string]string{}}})
}
