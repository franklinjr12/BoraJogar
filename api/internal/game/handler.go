package game

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
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
	Now           func() time.Time
	Notifications notification.Publisher
}
type gameSummary struct {
	ID                string    `json:"id"`
	Title             *string   `json:"title,omitempty"`
	StartsAt          time.Time `json:"startsAt"`
	EndsAt            time.Time `json:"endsAt"`
	VenueID           string    `json:"venueId"`
	VenueName         string    `json:"venueName"`
	AddressLabel      *string   `json:"addressLabel,omitempty"`
	Latitude          float64   `json:"latitude"`
	Longitude         float64   `json:"longitude"`
	Capacity          int       `json:"capacity"`
	ConfirmedPlayers  int       `json:"confirmedPlayers"`
	OpenSlots         int       `json:"openSlots"`
	WaitlistEnabled   bool      `json:"waitlistEnabled"`
	WaitlistSize      int       `json:"waitlistSize"`
	WaitlistCount     int       `json:"waitlistCount"`
	MinimumSkillLevel string    `json:"minimumSkillLevel"`
	MaximumSkillLevel string    `json:"maximumSkillLevel"`
	Visibility        string    `json:"visibility"`
	Status            string    `json:"status"`
	CurrentUserStatus string    `json:"currentUserStatus,omitempty"`
	CurrentUserRole   string    `json:"currentUserRole,omitempty"`
}
type gamePreview struct {
	ID                string    `json:"id"`
	Title             *string   `json:"title,omitempty"`
	StartsAt          time.Time `json:"startsAt"`
	EndsAt            time.Time `json:"endsAt"`
	VenueName         string    `json:"venueName"`
	AddressLabel      *string   `json:"addressLabel,omitempty"`
	Latitude          float64   `json:"latitude"`
	Longitude         float64   `json:"longitude"`
	Capacity          int       `json:"capacity"`
	ConfirmedPlayers  int       `json:"confirmedPlayers"`
	OpenSlots         int       `json:"openSlots"`
	WaitlistEnabled   bool      `json:"waitlistEnabled"`
	WaitlistSize      int       `json:"waitlistSize"`
	WaitlistCount     int       `json:"waitlistCount"`
	MinimumSkillLevel string    `json:"minimumSkillLevel"`
	MaximumSkillLevel string    `json:"maximumSkillLevel"`
	Visibility        string    `json:"visibility"`
	Status            string    `json:"status"`
}
type onboardingReadiness struct {
	Profile            bool     `json:"profile"`
	Location           bool     `json:"location"`
	Availability       bool     `json:"availability"`
	ProfileCount       int      `json:"profileCount"`
	FavoriteVenueCount int      `json:"favoriteVenueCount"`
	PreferredAreaCount int      `json:"preferredAreaCount"`
	AvailabilityCount  int      `json:"availabilityCount"`
	CanComplete        bool     `json:"canComplete"`
	Missing            []string `json:"missing"`
}
type availabilitySummary struct {
	ID      string   `json:"id"`
	Weekday int      `json:"weekday"`
	Start   string   `json:"start"`
	End     string   `json:"end"`
	Labels  []string `json:"labels"`
}
type dashboardResponse struct {
	DisplayName         string                `json:"displayName"`
	Readiness           onboardingReadiness   `json:"readiness"`
	NextGame            *gameSummary          `json:"nextGame,omitempty"`
	OpenGames           []gameSummary         `json:"openGames"`
	AvailabilitySummary []availabilitySummary `json:"availabilitySummary"`
}
type gameDetails struct {
	gameSummary
	Description       *string              `json:"description,omitempty"`
	Organizer         player               `json:"organizer"`
	Players           []player             `json:"players"`
	Waitlist          []player             `json:"waitlist"`
	Confirmation      *confirmationSummary `json:"confirmation,omitempty"`
	IsMember          bool                 `json:"isMember"`
	CurrentUserStatus string               `json:"currentUserStatus,omitempty"`
	CurrentUserRole   string               `json:"currentUserRole,omitempty"`
	ShareURL          string               `json:"shareUrl,omitempty"`
	shareTokenHash    string
}
type confirmationSummary struct {
	Enabled        bool `json:"enabled"`
	ConfirmedCount int  `json:"confirmedCount"`
	TotalPlayers   int  `json:"totalPlayers"`
}
type player struct {
	ID                    string `json:"id"`
	DisplayName           string `json:"displayName"`
	Role                  string `json:"role,omitempty"`
	Status                string `json:"status,omitempty"`
	ConfirmationConfirmed *bool  `json:"confirmationConfirmed,omitempty"`
	IsCurrentUser         bool   `json:"isCurrentUser"`
}
type actionResponse struct {
	Result string `json:"result"`
}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now().UTC()
}
func (h Handler) Register(mux *http.ServeMux, requireAuth func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/games", requireAuth(http.HandlerFunc(h.games)))
	mux.Handle("/api/v1/me/dashboard", requireAuth(http.HandlerFunc(h.dashboard)))
	mux.HandleFunc("/api/v1/games/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodGet && strings.HasSuffix(strings.Trim(r.URL.Path, "/"), "/preview") {
			h.preview(w, r)
			return
		}
		requireAuth(http.HandlerFunc(h.gameByID)).ServeHTTP(w, r)
	})
}
func (h Handler) games(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	if r.Method == http.MethodPost {
		h.create(w, r, u.ID)
		return
	}
	if r.Method == http.MethodGet {
		h.list(w, r, u.ID)
		return
	}
	w.WriteHeader(http.StatusMethodNotAllowed)
}
func (h Handler) gameByID(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/games/"), "/"), "/")
	if len(parts) == 0 || parts[0] == "" {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if len(parts) > 1 && parts[1] == "calendar.ics" && r.Method == http.MethodGet {
		h.calendar(w, r, id, u.ID)
		return
	}
	if len(parts) == 2 && parts[1] == "chat" {
		switch r.Method {
		case http.MethodGet:
			h.chatList(w, r, id, u.ID)
		case http.MethodPost:
			h.chatCreate(w, r, id, u.ID)
		default:
			w.WriteHeader(http.StatusMethodNotAllowed)
		}
		return
	}
	if len(parts) == 2 && parts[1] == "confirmation" {
		if r.Method != http.MethodPut {
			writeError(w, http.StatusMethodNotAllowed, "game_action_not_found", "Game action not found.")
			return
		}
		h.confirm(w, r, id, u.ID)
		return
	}
	if len(parts) > 1 && r.Method != http.MethodPost && r.Method != http.MethodDelete {
		w.WriteHeader(http.StatusNotFound)
		return
	}
	switch r.Method {
	case http.MethodGet:
		h.details(w, r, id, u.ID)
	case http.MethodPut:
		h.update(w, r, id, u.ID)
	case http.MethodPost:
		h.action(w, r, id, u.ID)
	case http.MethodDelete:
		h.action(w, r, id, u.ID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (h Handler) action(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	// Action routes use the stable game resource prefix plus operation suffix.
	op := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/games/"+id.String()), "/")
	if r.Method == http.MethodDelete && strings.HasPrefix(op, "players/") {
		targetPath := strings.TrimPrefix(op, "players/")
		if targetPath == "" || strings.Contains(targetPath, "/") {
			writeError(w, http.StatusNotFound, "player_not_found", "Player not found.")
			return
		}
		targetID, err := uuid.Parse(targetPath)
		if err != nil {
			writeError(w, http.StatusNotFound, "player_not_found", "Player not found.")
			return
		}
		h.removePlayer(w, r, id, userID, targetID)
		return
	}
	switch op {
	case "join":
		h.join(w, r, id, userID)
	case "leave":
		h.leave(w, r, id, userID)
	case "cancel":
		h.cancel(w, r, id, userID)
	case "waitlist":
		if r.Method == http.MethodPost {
			h.addWaitlist(w, r, id, userID)
		} else if r.Method == http.MethodDelete {
			h.removeWaitlist(w, r, id, userID)
		} else {
			writeError(w, http.StatusNotFound, "game_action_not_found", "Game action not found.")
		}
	default:
		writeError(w, 404, "game_action_not_found", "Game action not found.")
	}
}

func (h Handler) create(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	var in CreateInput
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		writeError(w, 422, "invalid_game", "Game input is invalid.")
		return
	}
	if in.Capacity == 0 {
		in.Capacity = 4
	}
	if in.DurationMinutes == 0 && in.EndsAt == "" {
		in.DurationMinutes = 90
	}
	if in.Visibility == "" {
		in.Visibility = "link-only"
	}
	if in.MinimumSkillLevel == "" && in.MaximumSkillLevel == "" {
		var creatorSkill string
		if err := h.DB.QueryRow(r.Context(), `SELECT skill_level FROM player_profiles WHERE user_id=$1`, userID).Scan(&creatorSkill); err != nil {
			writeError(w, 422, "profile_required", "Complete your profile before creating a game.")
			return
		}
		minimum, maximum := skillRank[creatorSkill]-1, skillRank[creatorSkill]+1
		if minimum < 0 {
			minimum = 0
		}
		if maximum > 4 {
			maximum = 4
		}
		for skill, rank := range skillRank {
			if rank == minimum {
				in.MinimumSkillLevel = skill
			}
			if rank == maximum {
				in.MaximumSkillLevel = skill
			}
		}
	}
	starts, ends, err := ValidateCreate(in, h.now())
	if err != nil {
		writeError(w, 422, "invalid_game", err.Error())
		return
	}
	venueID, err := uuid.Parse(in.VenueID)
	if err != nil {
		writeError(w, 422, "invalid_game", "venueId is invalid.")
		return
	}
	id := uuid.New()
	token, hash, err := newShareToken()
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	var active bool
	if err = tx.QueryRow(r.Context(), `SELECT active FROM venues WHERE id=$1 AND (approved_at IS NOT NULL OR created_by_user_id=$2)`, venueID, userID).Scan(&active); errors.Is(err, pgx.ErrNoRows) || !active {
		writeError(w, 422, "venue_inactive", "Selected venue is inactive or unavailable.")
		return
	} else if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO games(id,source_type,created_by_user_id,title,description,starts_at,ends_at,venue_id,capacity,waitlist_enabled,waitlist_size,confirmation_enabled,minimum_skill_level,maximum_skill_level,visibility,share_token_hash) VALUES($1,'manual',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`, id, userID, nullableString(in.Title), nullableString(in.Description), starts, ends, venueID, in.Capacity, in.WaitlistEnabled, in.WaitlistSize, in.ConfirmationEnabled, in.MinimumSkillLevel, in.MaximumSkillLevel, in.Visibility, hash); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `INSERT INTO game_players(game_id,user_id,role,status,attendance_status) VALUES($1,$2,'organizer','confirmed','unknown')`, id, userID); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	details, err := h.readDetails(r, id, userID)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	details.ShareURL = "/games/" + id.String() + "?access=" + token
	writeJSON(w, 201, details)
}
func nullableString(v *string) *string {
	if v == nil || strings.TrimSpace(*v) == "" {
		return nil
	}
	value := strings.TrimSpace(*v)
	return &value
}

func (h Handler) list(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	page, pageSize, ok := pagination(r)
	if !ok {
		writeError(w, http.StatusUnprocessableEntity, "invalid_pagination", "Page must be positive and pageSize must be between 1 and 100.")
		return
	}
	statusClause := "g.status = 'scheduled'"
	if r.URL.Query().Get("includeCancelled") == "true" {
		statusClause = "g.status IN ('scheduled', 'cancelled')"
	}
	now := h.now()
	rows, err := h.DB.Query(r.Context(), `SELECT g.id,g.title,g.starts_at,g.ends_at,g.venue_id,v.name,v.address_label,ST_Y(v.location::geometry),ST_X(v.location::geometry),g.capacity,(SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed'),(SELECT count(*) FROM game_waitlist gw WHERE gw.game_id=g.id),g.waitlist_enabled,g.waitlist_size,g.minimum_skill_level,g.maximum_skill_level,g.visibility,g.status,COALESCE((SELECT gp.status FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),CASE WHEN EXISTS (SELECT 1 FROM game_waitlist gw WHERE gw.game_id=g.id AND gw.user_id=$1) THEN 'waitlisted' ELSE '' END),COALESCE((SELECT gp.role FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),'') FROM games g JOIN venues v ON v.id=g.venue_id WHERE `+statusClause+` AND g.ends_at > $4 AND (g.visibility='public' OR g.created_by_user_id=$1 OR EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1 AND gp.status='confirmed')) ORDER BY (g.capacity - (SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed')) <= 0, ABS(EXTRACT(EPOCH FROM (g.starts_at - $4))), g.id LIMIT $2 OFFSET $3`, userID, pageSize+1, (page-1)*pageSize, now)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer rows.Close()
	out := []gameSummary{}
	for rows.Next() {
		var x gameSummary
		if err = rows.Scan(&x.ID, &x.Title, &x.StartsAt, &x.EndsAt, &x.VenueID, &x.VenueName, &x.AddressLabel, &x.Latitude, &x.Longitude, &x.Capacity, &x.ConfirmedPlayers, &x.WaitlistCount, &x.WaitlistEnabled, &x.WaitlistSize, &x.MinimumSkillLevel, &x.MaximumSkillLevel, &x.Visibility, &x.Status, &x.CurrentUserStatus, &x.CurrentUserRole); err != nil {
			http.Error(w, "game unavailable", 500)
			return
		}
		x.OpenSlots = x.Capacity - x.ConfirmedPlayers
		out = append(out, x)
	}
	hasMore := len(out) > pageSize
	if hasMore {
		out = out[:pageSize]
	}
	writeJSON(w, 200, map[string]any{"items": out, "page": page, "pageSize": pageSize, "hasMore": hasMore})
}

func (h Handler) dashboard(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	out := dashboardResponse{DisplayName: u.DisplayName, OpenGames: []gameSummary{}, AvailabilitySummary: []availabilitySummary{}}
	ready, err := h.dashboardReadiness(r, u.ID)
	if err != nil {
		http.Error(w, "dashboard unavailable", 500)
		return
	}
	out.Readiness = ready
	next, found, err := h.nextConfirmedGame(r, u.ID)
	if err != nil {
		http.Error(w, "dashboard unavailable", 500)
		return
	}
	if found {
		out.NextGame = &next
	}
	open, err := h.dashboardOpenGames(r, u.ID)
	if err != nil {
		http.Error(w, "dashboard unavailable", 500)
		return
	}
	out.OpenGames = open
	availability, err := h.dashboardAvailability(r, u.ID)
	if err != nil {
		http.Error(w, "dashboard unavailable", 500)
		return
	}
	out.AvailabilitySummary = availability
	writeJSON(w, 200, out)
}

func (h Handler) dashboardReadiness(r *http.Request, userID uuid.UUID) (onboardingReadiness, error) {
	var out onboardingReadiness
	if err := h.DB.QueryRow(r.Context(), `SELECT count(*) FROM player_profiles WHERE user_id=$1`, userID).Scan(&out.ProfileCount); err != nil {
		return out, err
	}
	if err := h.DB.QueryRow(r.Context(), `SELECT count(*) FROM user_favorite_venues f JOIN venues v ON v.id=f.venue_id WHERE f.user_id=$1 AND v.active=true`, userID).Scan(&out.FavoriteVenueCount); err != nil {
		return out, err
	}
	if err := h.DB.QueryRow(r.Context(), `SELECT count(*) FROM preferred_areas WHERE user_id=$1 AND active=true`, userID).Scan(&out.PreferredAreaCount); err != nil {
		return out, err
	}
	if err := h.DB.QueryRow(r.Context(), `
		SELECT count(*)
		FROM availability_rules ar
		WHERE ar.user_id=$1 AND ar.active=true AND (
			EXISTS (
				SELECT 1 FROM availability_rule_venues arv
				JOIN user_favorite_venues ufv ON ufv.venue_id=arv.venue_id AND ufv.user_id=ar.user_id
				JOIN venues v ON v.id=arv.venue_id AND v.active=true
				WHERE arv.availability_rule_id=ar.id
			) OR EXISTS (
				SELECT 1 FROM availability_rule_areas ara
				JOIN preferred_areas pa ON pa.id=ara.preferred_area_id AND pa.user_id=ar.user_id AND pa.active=true
				WHERE ara.availability_rule_id=ar.id
			)
		)`, userID).Scan(&out.AvailabilityCount); err != nil {
		return out, err
	}
	out.Profile = out.ProfileCount > 0
	out.Location = out.FavoriteVenueCount+out.PreferredAreaCount > 0
	out.Availability = out.AvailabilityCount > 0
	if !out.Profile {
		out.Missing = append(out.Missing, "profile")
	}
	if !out.Location {
		out.Missing = append(out.Missing, "location")
	}
	if !out.Availability {
		out.Missing = append(out.Missing, "availability")
	}
	out.CanComplete = len(out.Missing) == 0
	return out, nil
}

func (h Handler) nextConfirmedGame(r *http.Request, userID uuid.UUID) (gameSummary, bool, error) {
	var x gameSummary
	err := h.DB.QueryRow(r.Context(), `SELECT g.id,g.title,g.starts_at,g.ends_at,g.venue_id,v.name,v.address_label,ST_Y(v.location::geometry),ST_X(v.location::geometry),g.capacity,(SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed'),(SELECT count(*) FROM game_waitlist gw WHERE gw.game_id=g.id),g.waitlist_enabled,g.waitlist_size,g.minimum_skill_level,g.maximum_skill_level,g.visibility,g.status,COALESCE((SELECT gp.status FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),CASE WHEN EXISTS (SELECT 1 FROM game_waitlist gw WHERE gw.game_id=g.id AND gw.user_id=$1) THEN 'waitlisted' ELSE '' END),COALESCE((SELECT gp.role FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),'') FROM games g JOIN venues v ON v.id=g.venue_id JOIN game_players mine ON mine.game_id=g.id AND mine.user_id=$1 AND mine.status='confirmed' WHERE g.status='scheduled' AND g.ends_at > $2 ORDER BY g.starts_at,g.id LIMIT 1`, userID, h.now()).Scan(&x.ID, &x.Title, &x.StartsAt, &x.EndsAt, &x.VenueID, &x.VenueName, &x.AddressLabel, &x.Latitude, &x.Longitude, &x.Capacity, &x.ConfirmedPlayers, &x.WaitlistCount, &x.WaitlistEnabled, &x.WaitlistSize, &x.MinimumSkillLevel, &x.MaximumSkillLevel, &x.Visibility, &x.Status, &x.CurrentUserStatus, &x.CurrentUserRole)
	if errors.Is(err, pgx.ErrNoRows) {
		return x, false, nil
	}
	if err != nil {
		return x, false, err
	}
	x.OpenSlots = x.Capacity - x.ConfirmedPlayers
	return x, true, nil
}

func (h Handler) dashboardOpenGames(r *http.Request, userID uuid.UUID) ([]gameSummary, error) {
	now := h.now()
	rows, err := h.DB.Query(r.Context(), `SELECT g.id,g.title,g.starts_at,g.ends_at,g.venue_id,v.name,v.address_label,ST_Y(v.location::geometry),ST_X(v.location::geometry),g.capacity,(SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed'),(SELECT count(*) FROM game_waitlist gw WHERE gw.game_id=g.id),g.waitlist_enabled,g.waitlist_size,g.minimum_skill_level,g.maximum_skill_level,g.visibility,g.status,COALESCE((SELECT gp.status FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),CASE WHEN EXISTS (SELECT 1 FROM game_waitlist gw WHERE gw.game_id=g.id AND gw.user_id=$1) THEN 'waitlisted' ELSE '' END),COALESCE((SELECT gp.role FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1),'') FROM games g JOIN venues v ON v.id=g.venue_id WHERE g.status='scheduled' AND g.ends_at > $2 AND g.visibility='public' AND NOT EXISTS (SELECT 1 FROM game_players gp WHERE gp.game_id=g.id AND gp.user_id=$1 AND gp.status='confirmed') ORDER BY (g.capacity - (SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed')) <= 0, ABS(EXTRACT(EPOCH FROM (g.starts_at - $2))), g.id LIMIT 3`, userID, now)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []gameSummary{}
	for rows.Next() {
		var x gameSummary
		if err = rows.Scan(&x.ID, &x.Title, &x.StartsAt, &x.EndsAt, &x.VenueID, &x.VenueName, &x.AddressLabel, &x.Latitude, &x.Longitude, &x.Capacity, &x.ConfirmedPlayers, &x.WaitlistCount, &x.WaitlistEnabled, &x.WaitlistSize, &x.MinimumSkillLevel, &x.MaximumSkillLevel, &x.Visibility, &x.Status, &x.CurrentUserStatus, &x.CurrentUserRole); err != nil {
			return nil, err
		}
		x.OpenSlots = x.Capacity - x.ConfirmedPlayers
		out = append(out, x)
	}
	return out, rows.Err()
}

func (h Handler) dashboardAvailability(r *http.Request, userID uuid.UUID) ([]availabilitySummary, error) {
	rows, err := h.DB.Query(r.Context(), `SELECT id,weekday,to_char(start_local_time,'HH24:MI'),to_char(end_local_time,'HH24:MI') FROM availability_rules WHERE user_id=$1 AND active=true ORDER BY weekday,start_local_time LIMIT 4`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []availabilitySummary{}
	for rows.Next() {
		var x availabilitySummary
		if err = rows.Scan(&x.ID, &x.Weekday, &x.Start, &x.End); err != nil {
			return nil, err
		}
		labels, labelErr := h.availabilityLabels(r, x.ID)
		if labelErr != nil {
			return nil, labelErr
		}
		x.Labels = labels
		out = append(out, x)
	}
	return out, rows.Err()
}

func (h Handler) availabilityLabels(r *http.Request, ruleID string) ([]string, error) {
	rows, err := h.DB.Query(r.Context(), `SELECT v.name FROM availability_rule_venues arv JOIN venues v ON v.id=arv.venue_id WHERE arv.availability_rule_id=$1 UNION ALL SELECT pa.label FROM availability_rule_areas ara JOIN preferred_areas pa ON pa.id=ara.preferred_area_id WHERE ara.availability_rule_id=$1 ORDER BY 1`, ruleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var label string
		if err = rows.Scan(&label); err != nil {
			return nil, err
		}
		out = append(out, label)
	}
	return out, rows.Err()
}

func pagination(r *http.Request) (int, int, bool) {
	page, pageSize := 1, 30
	var err error
	if raw := r.URL.Query().Get("page"); raw != "" {
		page, err = strconv.Atoi(raw)
		if err != nil {
			return 0, 0, false
		}
	}
	if raw := r.URL.Query().Get("pageSize"); raw != "" {
		pageSize, err = strconv.Atoi(raw)
		if err != nil {
			return 0, 0, false
		}
	}
	return page, pageSize, page >= 1 && pageSize >= 1 && pageSize <= 100
}

func (h Handler) calendar(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	x, err := h.readDetails(r, id, userID)
	if errors.Is(err, ErrNotFound) || (err == nil && !h.canAccessCalendar(r, x)) {
		writeError(w, http.StatusNotFound, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "text/calendar; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="borajogar-`+x.ID+`.ics"`)
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write([]byte(buildICS(x, r)))
}

func (h Handler) canAccessCalendar(r *http.Request, x gameDetails) bool {
	if x.Visibility == "public" || x.IsMember || x.CurrentUserRole == "organizer" {
		return true
	}
	return x.Visibility == "link-only" && r.URL.Query().Get("access") != "" && hashToken(r.URL.Query().Get("access")) == x.shareTokenHash
}
func (h Handler) details(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	x, err := h.readDetails(r, id, userID)
	if errors.Is(err, ErrNotFound) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if x.Visibility == "link-only" && !x.IsMember && x.CurrentUserStatus != "removed" && x.CurrentUserStatus != "waitlisted" {
		token := r.URL.Query().Get("access")
		if token == "" || hashToken(token) != x.shareTokenHash {
			writeError(w, 404, "game_not_found", "Game not found.")
			return
		}
	}
	if x.Visibility == "private" && !x.IsMember && x.CurrentUserStatus != "waitlisted" {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	writeJSON(w, 200, x)
}

func (h Handler) preview(w http.ResponseWriter, r *http.Request) {
	raw := strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/games/"), "/")
	raw = strings.TrimSuffix(raw, "/preview")
	id, err := uuid.Parse(strings.Trim(raw, "/"))
	if err != nil {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	var out gamePreview
	var shareTokenHash string
	err = h.DB.QueryRow(r.Context(), `SELECT g.id,g.title,g.starts_at,g.ends_at,v.name,v.address_label,ST_Y(v.location::geometry),ST_X(v.location::geometry),g.capacity,(SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed'),(SELECT count(*) FROM game_waitlist gw WHERE gw.game_id=g.id),g.waitlist_enabled,g.waitlist_size,g.minimum_skill_level,g.maximum_skill_level,g.visibility,g.status,COALESCE(g.share_token_hash,'') FROM games g JOIN venues v ON v.id=g.venue_id WHERE g.id=$1`, id).Scan(&out.ID, &out.Title, &out.StartsAt, &out.EndsAt, &out.VenueName, &out.AddressLabel, &out.Latitude, &out.Longitude, &out.Capacity, &out.ConfirmedPlayers, &out.WaitlistCount, &out.WaitlistEnabled, &out.WaitlistSize, &out.MinimumSkillLevel, &out.MaximumSkillLevel, &out.Visibility, &out.Status, &shareTokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if out.Visibility == "private" || (out.Visibility == "link-only" && hashToken(r.URL.Query().Get("access")) != shareTokenHash) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	out.OpenSlots = out.Capacity - out.ConfirmedPlayers
	writeJSON(w, 200, out)
}

func (h Handler) readDetails(r *http.Request, id, userID uuid.UUID) (gameDetails, error) {
	var x gameDetails
	var confirmationEnabled bool
	err := h.DB.QueryRow(r.Context(), `SELECT g.id,g.title,g.description,g.starts_at,g.ends_at,g.venue_id,v.name,v.address_label,ST_Y(v.location::geometry),ST_X(v.location::geometry),g.capacity,(SELECT count(*) FROM game_players gp WHERE gp.game_id=g.id AND gp.status='confirmed'),(SELECT count(*) FROM game_waitlist gw WHERE gw.game_id=g.id),g.waitlist_enabled,g.waitlist_size,g.minimum_skill_level,g.maximum_skill_level,g.visibility,g.status,g.confirmation_enabled,COALESCE(g.share_token_hash,'') FROM games g JOIN venues v ON v.id=g.venue_id WHERE g.id=$1`, id).Scan(&x.ID, &x.Title, &x.Description, &x.StartsAt, &x.EndsAt, &x.VenueID, &x.VenueName, &x.AddressLabel, &x.Latitude, &x.Longitude, &x.Capacity, &x.ConfirmedPlayers, &x.WaitlistCount, &x.WaitlistEnabled, &x.WaitlistSize, &x.MinimumSkillLevel, &x.MaximumSkillLevel, &x.Visibility, &x.Status, &confirmationEnabled, &x.shareTokenHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return x, ErrNotFound
	}
	if err != nil {
		return x, err
	}
	x.OpenSlots = x.Capacity - x.ConfirmedPlayers
	var status, role string
	err = h.DB.QueryRow(r.Context(), `SELECT COALESCE((SELECT status FROM game_players WHERE game_id=$1 AND user_id=$2),CASE WHEN EXISTS (SELECT 1 FROM game_waitlist WHERE game_id=$1 AND user_id=$2) THEN 'waitlisted' ELSE '' END),COALESCE((SELECT role FROM game_players WHERE game_id=$1 AND user_id=$2),'')`, id, userID).Scan(&status, &role)
	if err != nil {
		return x, err
	}
	x.IsMember = status == "confirmed"
	x.CurrentUserStatus = status
	x.CurrentUserRole = role
	var organizer player
	err = h.DB.QueryRow(r.Context(), `SELECT u.id,u.display_name,gp.role,gp.status FROM game_players gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=$1 AND gp.role='organizer'`, id).Scan(&organizer.ID, &organizer.DisplayName, &organizer.Role, &organizer.Status)
	if err != nil {
		return x, err
	}
	x.Organizer = organizer
	rows, err := h.DB.Query(r.Context(), `SELECT u.id,u.display_name,gp.role,gp.status,gp.confirmation_confirmed FROM game_players gp JOIN users u ON u.id=gp.user_id WHERE gp.game_id=$1 AND gp.status='confirmed' ORDER BY gp.joined_at`, id)
	if err != nil {
		return x, err
	}
	defer rows.Close()
	x.Players = []player{}
	for rows.Next() {
		var p player
		var confirmed bool
		if err = rows.Scan(&p.ID, &p.DisplayName, &p.Role, &p.Status, &confirmed); err != nil {
			return x, err
		}
		p.IsCurrentUser = p.ID == userID.String()
		if x.IsMember && confirmationEnabled {
			p.ConfirmationConfirmed = &confirmed
		}
		x.Players = append(x.Players, p)
	}
	rows, err = h.DB.Query(r.Context(), `SELECT u.id,u.display_name FROM game_waitlist gw JOIN users u ON u.id=gw.user_id WHERE gw.game_id=$1 ORDER BY gw.position`, id)
	if err != nil {
		return x, err
	}
	defer rows.Close()
	x.Waitlist = []player{}
	for rows.Next() {
		var p player
		if err = rows.Scan(&p.ID, &p.DisplayName); err != nil {
			return x, err
		}
		x.Waitlist = append(x.Waitlist, p)
	}
	if x.IsMember {
		var confirmedCount int
		if err = h.DB.QueryRow(r.Context(), `SELECT count(*) FILTER (WHERE confirmation_confirmed),count(*) FROM game_players WHERE game_id=$1 AND status='confirmed'`, id).Scan(&confirmedCount, &x.ConfirmedPlayers); err != nil {
			return x, err
		}
		x.OpenSlots = x.Capacity - x.ConfirmedPlayers
		x.Confirmation = &confirmationSummary{Enabled: confirmationEnabled, ConfirmedCount: confirmedCount, TotalPlayers: x.ConfirmedPlayers}
	}
	return x, nil
}

func (h Handler) confirm(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	var in struct {
		Confirmed *bool `json:"confirmed"`
	}
	if json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10)).Decode(&in) != nil || in.Confirmed == nil {
		writeError(w, http.StatusUnprocessableEntity, "invalid_confirmation", "Confirmation input is invalid.")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	defer tx.Rollback(r.Context())
	var startsAt, endsAt time.Time
	var status string
	var enabled bool
	if err = tx.QueryRow(r.Context(), `SELECT starts_at,ends_at,status,confirmation_enabled FROM games WHERE id=$1 FOR UPDATE`, id).Scan(&startsAt, &endsAt, &status, &enabled); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "game_not_found", "Game not found.")
		return
	} else if err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	var participant bool
	if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM game_players WHERE game_id=$1 AND user_id=$2 AND status='confirmed')`, id, userID).Scan(&participant); err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	if !participant {
		writeError(w, http.StatusForbidden, "confirmation_forbidden", "Only confirmed participants can update confirmation.")
		return
	}
	if !enabled {
		writeError(w, http.StatusConflict, "confirmation_disabled", "Confirmation is disabled for this game.")
		return
	}
	now := h.now()
	if !ConfirmationWindowOpen(enabled, status, startsAt, endsAt, now) {
		writeError(w, http.StatusConflict, "confirmation_window_closed", "Confirmation is only available from 24 hours before the game until it ends.")
		return
	}
	var confirmedAt *time.Time
	if *in.Confirmed {
		confirmedAt = &now
	}
	if _, err = tx.Exec(r.Context(), `UPDATE game_players SET confirmation_confirmed=$1,confirmation_at=$2 WHERE game_id=$3 AND user_id=$4 AND status='confirmed'`, *in.Confirmed, confirmedAt, id, userID); err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) join(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	var starts time.Time
	var ends time.Time
	var cap, waitlistSize int
	var waitlistEnabled bool
	var min, max, status, visibility string
	if err = tx.QueryRow(r.Context(), `SELECT starts_at,ends_at,capacity,waitlist_enabled,waitlist_size,minimum_skill_level,maximum_skill_level,status,visibility FROM games WHERE id=$1 FOR UPDATE`, id).Scan(&starts, &ends, &cap, &waitlistEnabled, &waitlistSize, &min, &max, &status, &visibility); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	} else if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if status != "scheduled" || !starts.After(h.now()) {
		writeError(w, 409, "game_not_joinable", "Game is not open for joining.")
		return
	}
	if visibility != "public" {
		var blocked bool
		if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM game_players gp JOIN user_blocks ub ON (ub.blocker_user_id=gp.user_id AND ub.blocked_user_id=$2) OR (ub.blocker_user_id=$2 AND ub.blocked_user_id=gp.user_id WHERE gp.game_id=$1 AND gp.status='confirmed')`, id, userID).Scan(&blocked); err != nil {
			http.Error(w, "game unavailable", 500)
			return
		}
		if blocked {
			writeError(w, 403, "blocked_user", "You cannot join this game.")
			return
		}
	}
	var skill string
	err = tx.QueryRow(r.Context(), `SELECT skill_level FROM player_profiles WHERE user_id=$1`, userID).Scan(&skill)
	if errors.Is(err, pgx.ErrNoRows) {
		// Link joins need only a profile identity and a skill accepted by this game.
		// Locations and availability remain optional until the player completes setup.
		err = tx.QueryRow(r.Context(), `INSERT INTO player_profiles(user_id,skill_level) VALUES($1,$2) ON CONFLICT(user_id) DO NOTHING RETURNING skill_level`, userID, min).Scan(&skill)
		if errors.Is(err, pgx.ErrNoRows) {
			err = tx.QueryRow(r.Context(), `SELECT skill_level FROM player_profiles WHERE user_id=$1`, userID).Scan(&skill)
		}
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if !SkillAllowed(min, max, skill) {
		writeError(w, 409, "skill_out_of_range", "Your skill level is outside this game range.")
		return
	}
	var existing string
	err = tx.QueryRow(r.Context(), `SELECT status FROM game_players WHERE game_id=$1 AND user_id=$2`, id, userID).Scan(&existing)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err == nil && existing == "confirmed" {
		writeError(w, 409, "already_joined", "You already joined this game.")
		return
	}
	if err == nil && existing == "removed" {
		writeError(w, 403, "player_removed", "The organizer removed you from this game.")
		return
	}
	var alreadyWaitlisted bool
	if err = tx.QueryRow(r.Context(), `SELECT EXISTS(SELECT 1 FROM game_waitlist WHERE game_id=$1 AND user_id=$2)`, id, userID).Scan(&alreadyWaitlisted); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	var conflict struct {
		ID           uuid.UUID
		Title        string
		StartsAt     time.Time
		EndsAt       time.Time
		VenueName    string
		AddressLabel string
	}
	err = tx.QueryRow(r.Context(), `SELECT g.id,COALESCE(g.title,''),g.starts_at,g.ends_at,v.name,COALESCE(v.address_label,'') FROM game_players gp JOIN games g ON g.id=gp.game_id JOIN venues v ON v.id=g.venue_id WHERE gp.user_id=$1 AND gp.status='confirmed' AND g.status='scheduled' AND g.starts_at < $3 AND g.ends_at > $2 ORDER BY g.starts_at,g.id LIMIT 1`, userID, starts, ends).Scan(&conflict.ID, &conflict.Title, &conflict.StartsAt, &conflict.EndsAt, &conflict.VenueName, &conflict.AddressLabel)
	if errors.Is(err, pgx.ErrNoRows) {
		err = nil
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if conflict.ID != uuid.Nil {
		fields := map[string]string{
			"gameId":    conflict.ID.String(),
			"startsAt":  conflict.StartsAt.Format(time.RFC3339),
			"endsAt":    conflict.EndsAt.Format(time.RFC3339),
			"venueName": conflict.VenueName,
		}
		if conflict.Title != "" {
			fields["title"] = conflict.Title
		}
		if conflict.AddressLabel != "" {
			fields["addressLabel"] = conflict.AddressLabel
		}
		writeErrorFields(w, 409, "conflicting_game", "You already have a conflicting confirmed game.", fields)
		return
	}
	var count int
	if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM game_players WHERE game_id=$1 AND status='confirmed'`, id).Scan(&count); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if count < cap {
		_, err = tx.Exec(r.Context(), `INSERT INTO game_players(game_id,user_id,role,status,attendance_status) VALUES($1,$2,'player','confirmed','unknown') ON CONFLICT(game_id,user_id) DO UPDATE SET status='confirmed',cancelled_at=NULL,joined_at=now(),confirmation_confirmed=false,confirmation_at=NULL`, id, userID)
		if err != nil {
			http.Error(w, "game unavailable", 500)
			return
		}
		if _, err = tx.Exec(r.Context(), `DELETE FROM game_waitlist WHERE game_id=$1 AND user_id=$2`, id, userID); err != nil {
			http.Error(w, "game unavailable", 500)
			return
		}
		if err = tx.Commit(r.Context()); err != nil {
			http.Error(w, "game unavailable", 500)
			return
		}
		writeJSON(w, 200, actionResponse{Result: "confirmed"})
		return
	}
	if !waitlistEnabled {
		writeError(w, 409, "game_full", "Game is full.")
		return
	}
	if alreadyWaitlisted {
		writeError(w, 409, "game_full", "This game is full; the open slot was taken.")
		return
	}
	if err = insertWaitlist(r, tx, id, userID, waitlistSize); err != nil {
		if errors.Is(err, ErrConflict) {
			writeError(w, 409, "already_waitlisted", "You already joined the waitlist.")
			return
		}
		if errors.Is(err, ErrWaitlistFull) {
			writeError(w, 409, "waitlist_full", "The waitlist is full.")
			return
		}
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	writeJSON(w, 200, actionResponse{Result: "waitlisted"})
}
func insertWaitlist(r *http.Request, tx pgx.Tx, id, userID uuid.UUID, waitlistSize int) error {
	var exists int
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM game_waitlist WHERE game_id=$1 AND user_id=$2`, id, userID).Scan(&exists); err != nil {
		return err
	}
	if exists > 0 {
		return ErrConflict
	}
	var count int
	if err := tx.QueryRow(r.Context(), `SELECT count(*) FROM game_waitlist WHERE game_id=$1`, id).Scan(&count); err != nil {
		return err
	}
	if count >= waitlistSize {
		return ErrWaitlistFull
	}
	var pos int
	if err := tx.QueryRow(r.Context(), `SELECT COALESCE(max(position),0)+1 FROM game_waitlist WHERE game_id=$1`, id).Scan(&pos); err != nil {
		return err
	}
	_, err := tx.Exec(r.Context(), `INSERT INTO game_waitlist(game_id,user_id,position) VALUES($1,$2,$3)`, id, userID, pos)
	return err
}
func (h Handler) addWaitlist(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	// Keep legacy waitlist POST clients on the same eligibility and locking path.
	h.join(w, r, id, userID)
}
func (h Handler) removeWaitlist(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	tag, err := h.DB.Exec(r.Context(), `DELETE FROM game_waitlist WHERE game_id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "waitlist_entry_not_found", "Waitlist entry not found.")
		return
	}
	w.WriteHeader(204)
}
func (h Handler) leave(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	var gameStatus string
	if err = tx.QueryRow(r.Context(), `SELECT status FROM games WHERE id=$1 FOR UPDATE`, id).Scan(&gameStatus); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if gameStatus != "scheduled" {
		writeError(w, 409, "game_not_joinable", "This game is not active.")
		return
	}
	var role, status string
	if err = tx.QueryRow(r.Context(), `SELECT role,status FROM game_players WHERE game_id=$1 AND user_id=$2 FOR UPDATE`, id, userID).Scan(&role, &status); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "player_not_found", "You are not a player in this game.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if role == "organizer" {
		writeError(w, 409, "organizer_must_cancel", "Organizer must cancel the game.")
		return
	}
	if status != "confirmed" {
		writeError(w, 409, "not_confirmed", "You are not confirmed in this game.")
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE game_players gp SET status='cancelled',cancelled_at=now(),cancellation_type=CASE WHEN g.starts_at <= now() THEN 'no_show' WHEN g.starts_at-now() < interval '6 hours' THEN 'late' ELSE 'early' END,cancellation_threshold_minutes=360 FROM games g WHERE gp.game_id=g.id AND gp.game_id=$1 AND gp.user_id=$2`, id, userID); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	recipients, err := waitlistRecipients(tx, r, id)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	h.notifyWaitlistOpen(r.Context(), recipients, id)
	writeJSON(w, 200, actionResponse{Result: "left"})
}

func (h Handler) removePlayer(w http.ResponseWriter, r *http.Request, id, userID, targetID uuid.UUID) {
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	var gameStatus string
	if err = tx.QueryRow(r.Context(), `SELECT status FROM games WHERE id=$1 FOR UPDATE`, id).Scan(&gameStatus); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if gameStatus != "scheduled" {
		writeError(w, 409, "game_not_joinable", "This game is not active.")
		return
	}
	var actorRole string
	if err = tx.QueryRow(r.Context(), `SELECT role FROM game_players WHERE game_id=$1 AND user_id=$2 AND status='confirmed' FOR UPDATE`, id, userID).Scan(&actorRole); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 403, "game_remove_forbidden", "Only the organizer can remove players.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	var targetRole, targetStatus string
	if err = tx.QueryRow(r.Context(), `SELECT role,status FROM game_players WHERE game_id=$1 AND user_id=$2 FOR UPDATE`, id, targetID).Scan(&targetRole, &targetStatus); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "player_not_found", "Player not found in this game.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = ValidatePlayerRemoval(actorRole, targetRole, targetStatus); errors.Is(err, ErrForbidden) {
		writeError(w, 403, "game_remove_forbidden", "Only the organizer can remove players.")
		return
	} else if errors.Is(err, ErrConflict) {
		writeError(w, 409, "player_not_removable", "This player cannot be removed.")
		return
	} else if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE game_players SET status='removed',cancelled_at=now() WHERE game_id=$1 AND user_id=$2`, id, targetID); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	recipients, err := waitlistRecipients(tx, r, id)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	h.notifyGameUsers(r.Context(), []uuid.UUID{targetID}, notification.GameChanged, "Você foi removido da partida.", "O organizador removeu você desta partida.", id, targetID)
	h.notifyWaitlistOpen(r.Context(), recipients, id)
	writeJSON(w, 200, actionResponse{Result: "removed"})
}

func waitlistRecipients(tx pgx.Tx, r *http.Request, id uuid.UUID) ([]uuid.UUID, error) {
	rows, err := tx.Query(r.Context(), `SELECT user_id FROM game_waitlist WHERE game_id=$1 ORDER BY position`, id)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	recipients := []uuid.UUID{}
	for rows.Next() {
		var userID uuid.UUID
		if err = rows.Scan(&userID); err != nil {
			return nil, err
		}
		recipients = append(recipients, userID)
	}
	return recipients, rows.Err()
}

func (h Handler) notifyWaitlistOpen(ctx context.Context, recipients []uuid.UUID, gameID uuid.UUID) {
	h.notifyGameUsers(ctx, recipients, notification.WaitlistOpen, "Vaga disponível.", "Uma vaga abriu. Entre agora; a primeira pessoa a confirmar fica com a vaga.", gameID, uuid.Nil)
}

func (h Handler) cancel(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	var in struct {
		Reason *string `json:"reason"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil && r.ContentLength > 0 {
		writeError(w, 422, "invalid_cancellation", "Cancellation input is invalid.")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	var gameStatus string
	var creatorID uuid.UUID
	var cancellation notification.GameCancellationPayload
	var startsAt, endsAt time.Time
	if err = tx.QueryRow(r.Context(), `SELECT g.status,g.created_by_user_id,g.title,g.starts_at,g.ends_at,v.name,v.address_label FROM games g JOIN venues v ON v.id=g.venue_id WHERE g.id=$1 FOR UPDATE`, id).Scan(&gameStatus, &creatorID, &cancellation.Title, &startsAt, &endsAt, &cancellation.VenueName, &cancellation.AddressLabel); errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "game_not_found", "Game not found.")
		return
	}
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	var isAdmin bool
	if err = tx.QueryRow(r.Context(), `SELECT COALESCE(is_admin,false) FROM users WHERE id=$1`, userID).Scan(&isAdmin); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if creatorID != userID && !isAdmin {
		writeError(w, 403, "game_cancel_forbidden", "Only organizer or admin can cancel this game.")
		return
	}
	if gameStatus != "scheduled" {
		writeError(w, 409, "game_not_cancellable", "This game is already closed.")
		return
	}
	rows, err := tx.Query(r.Context(), `SELECT user_id FROM game_players WHERE game_id=$1 AND status='confirmed' AND user_id<>$2 UNION SELECT user_id FROM game_waitlist WHERE game_id=$1`, id, userID)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	recipients := []uuid.UUID{}
	for rows.Next() {
		var recipient uuid.UUID
		if err = rows.Scan(&recipient); err != nil {
			rows.Close()
			http.Error(w, "game unavailable", 500)
			return
		}
		recipients = append(recipients, recipient)
	}
	if err = rows.Err(); err != nil {
		rows.Close()
		http.Error(w, "game unavailable", 500)
		return
	}
	rows.Close()
	if _, err = tx.Exec(r.Context(), `UPDATE games SET status='cancelled',cancelled_at=now(),cancellation_threshold_minutes=360,cancellation_reason=$1,updated_at=now() WHERE id=$2`, nullableString(in.Reason), id); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM game_waitlist WHERE game_id=$1`, id); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `UPDATE notification_deliveries AS d SET status='disabled',last_attempt_at=now(),error_message='game notification disabled because game was cancelled' FROM notification_events AS e WHERE d.notification_event_id=e.id AND d.status='pending' AND e.type IN ('match_confirmation','game_reminder') AND e.payload->>'gameId'=$1`, id.String()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	cancellation.GameID, cancellation.StartsAt, cancellation.EndsAt, cancellation.Reason = id.String(), startsAt, endsAt, nullableString(in.Reason)
	h.notifyGameCancellation(r.Context(), recipients, cancellation)
	w.WriteHeader(204)
}

func (h Handler) notifyGameCancellation(ctx context.Context, recipients []uuid.UUID, payload notification.GameCancellationPayload) {
	if h.Notifications == nil {
		return
	}
	for _, recipient := range recipients {
		_ = h.Notifications.Publish(ctx, notification.EventInput{
			UserID:    recipient,
			Type:      notification.GameCancelled,
			Title:     "Partida cancelada.",
			Body:      "O organizador cancelou esta partida.",
			ActionURL: "/games/" + payload.GameID,
			Payload:   payload,
		})
	}
}

func (h Handler) notifyGameUsers(ctx context.Context, recipients []uuid.UUID, eventType notification.Type, title, body string, gameID, playerID uuid.UUID) {
	if h.Notifications == nil {
		return
	}
	for _, recipient := range recipients {
		payload := map[string]string{"gameId": gameID.String()}
		if playerID != uuid.Nil {
			payload["playerId"] = playerID.String()
		}
		_ = h.Notifications.Publish(ctx, notification.EventInput{
			UserID:    recipient,
			Type:      eventType,
			Title:     title,
			Body:      body,
			ActionURL: "/games/" + gameID.String(),
			Payload:   payload,
		})
	}
}
func (h Handler) update(w http.ResponseWriter, r *http.Request, id, userID uuid.UUID) {
	var in struct {
		Title       *string `json:"title"`
		Description *string `json:"description"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		writeError(w, 422, "invalid_game", "Game input is invalid.")
		return
	}
	tag, err := h.DB.Exec(r.Context(), `UPDATE games SET title=$1,description=$2,updated_at=now() WHERE id=$3 AND created_by_user_id=$4 AND status='scheduled'`, nullableString(in.Title), nullableString(in.Description), id, userID)
	if err != nil {
		http.Error(w, "game unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 403, "game_update_forbidden", "Only organizer can update this game.")
		return
	}
	h.details(w, r, id, userID)
}
func newShareToken() (string, string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	return token, hashToken(token), nil
}
func hashToken(v string) string { s := sha256.Sum256([]byte(v)); return hex.EncodeToString(s[:]) }
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}}})
}

func writeErrorFields(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": fields}})
}
