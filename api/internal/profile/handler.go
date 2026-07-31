package profile

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var validSkills = map[string]bool{"learning": true, "beginner": true, "intermediate": true, "advanced": true, "competitive": true}
var validStyles = map[string]bool{"casual": true, "competitive": true, "training_focused": true, "mixed": true}
var durations = map[int]bool{60: true, 90: true, 120: true}

type Handler struct{ DB *pgxpool.Pool }

type profileResponse struct {
	UserID                       string   `json:"userId"`
	DisplayName                  string   `json:"displayName"`
	AvatarURL                    *string  `json:"avatarUrl,omitempty"`
	TimeZone                     string   `json:"timeZone"`
	SkillLevel                   string   `json:"skillLevel"`
	Bio                          *string  `json:"bio,omitempty"`
	Styles                       []string `json:"styles"`
	PreferredGameDurationMinutes int      `json:"preferredGameDurationMinutes"`
	MinimumNoticeMinutes         int      `json:"minimumNoticeMinutes"`
	ActiveForMatchmaking         bool     `json:"activeForMatchmaking"`
}
type profileInput struct {
	DisplayName                  string   `json:"displayName"`
	TimeZone                     string   `json:"timeZone"`
	SkillLevel                   string   `json:"skillLevel"`
	Bio                          *string  `json:"bio"`
	Styles                       []string `json:"styles"`
	PreferredGameDurationMinutes int      `json:"preferredGameDurationMinutes"`
	MinimumNoticeMinutes         int      `json:"minimumNoticeMinutes"`
	ActiveForMatchmaking         *bool    `json:"activeForMatchmaking"`
}

func validateProfileInput(in profileInput, onboardingComplete bool) (profileInput, error) {
	in.DisplayName, in.TimeZone = strings.TrimSpace(in.DisplayName), strings.TrimSpace(in.TimeZone)
	if len(in.DisplayName) < 2 || len(in.DisplayName) > 80 || !validSkills[in.SkillLevel] || !durations[in.PreferredGameDurationMinutes] || in.MinimumNoticeMinutes < 0 || in.MinimumNoticeMinutes > 10080 || in.TimeZone == "" || len(in.Styles) == 0 {
		return profileInput{}, errors.New("profile fields are invalid")
	}
	if _, err := time.LoadLocation(in.TimeZone); err != nil {
		return profileInput{}, errors.New("time zone must be a valid IANA time zone")
	}
	seen := map[string]bool{}
	for _, style := range in.Styles {
		if !validStyles[style] || seen[style] {
			return profileInput{}, errors.New("playing styles are invalid")
		}
		seen[style] = true
	}
	if in.Bio != nil {
		bio := strings.TrimSpace(*in.Bio)
		if len(bio) > 280 {
			return profileInput{}, errors.New("bio must be 280 characters or fewer")
		}
		in.Bio = &bio
	}
	requestedActive := true
	if in.ActiveForMatchmaking != nil {
		requestedActive = *in.ActiveForMatchmaking
	}
	in.ActiveForMatchmaking = boolPtr(requestedActive && onboardingComplete)
	return in, nil
}
func boolPtr(value bool) *bool { return &value }

func validateProgress(p progress) error {
	if p.CurrentStep < 0 || p.CurrentStep > 8 {
		return errors.New("onboarding progress is invalid")
	}
	for _, step := range p.CompletedSteps {
		if step < 0 || step > 8 {
			return errors.New("onboarding progress is invalid")
		}
	}
	return nil
}

func (h Handler) Register(mux *http.ServeMux, requireAuth func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/me/profile", requireAuth(http.HandlerFunc(h.profile)))
	mux.Handle("/api/v1/me/onboarding", requireAuth(http.HandlerFunc(h.onboarding)))
	mux.Handle("/api/v1/me/onboarding/complete", requireAuth(http.HandlerFunc(h.completeOnboarding)))
	mux.Handle("/api/v1/users/", requireAuth(http.HandlerFunc(h.publicProfile)))
}

func user(r *http.Request) (auth.User, bool) { return auth.UserFromContext(r.Context()) }
func (h Handler) profile(w http.ResponseWriter, r *http.Request) {
	u, _ := user(r)
	switch r.Method {
	case http.MethodGet:
		h.getProfile(w, r, u.ID)
	case http.MethodPut:
		h.putProfile(w, r, u)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (h Handler) getProfile(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var out profileResponse
	var bio *string
	var avatar *string
	err := h.DB.QueryRow(r.Context(), `SELECT u.id,u.display_name,u.avatar_url,u.time_zone,p.skill_level,p.bio,p.preferred_game_duration_minutes,p.minimum_notice_minutes,p.active_for_matchmaking FROM users u JOIN player_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.status='active' AND u.deleted_at IS NULL`, id).Scan(&out.UserID, &out.DisplayName, &avatar, &out.TimeZone, &out.SkillLevel, &bio, &out.PreferredGameDurationMinutes, &out.MinimumNoticeMinutes, &out.ActiveForMatchmaking)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusNotFound, "profile_not_found", "Profile not found.")
		return
	}
	if err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	out.AvatarURL, out.Bio, out.Styles = avatar, bio, h.styles(r.Context(), id)
	writeJSON(w, http.StatusOK, out)
}
func (h Handler) putProfile(w http.ResponseWriter, r *http.Request, u auth.User) {
	var in profileInput
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		writeError(w, 422, "invalid_profile", "Profile data is invalid.")
		return
	}
	validated, validationErr := validateProfileInput(in, u.OnboardingComplete)
	if validationErr != nil {
		writeError(w, 422, "invalid_profile", validationErr.Error())
		return
	}
	in, active, bio := validated, *validated.ActiveForMatchmaking, validated.Bio
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `UPDATE users SET display_name=$1,time_zone=$2,updated_at=now() WHERE id=$3`, in.DisplayName, in.TimeZone, u.ID)
	if err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	_, err = tx.Exec(r.Context(), `INSERT INTO player_profiles(user_id,skill_level,bio,preferred_game_duration_minutes,minimum_notice_minutes,active_for_matchmaking) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(user_id) DO UPDATE SET skill_level=EXCLUDED.skill_level,bio=EXCLUDED.bio,preferred_game_duration_minutes=EXCLUDED.preferred_game_duration_minutes,minimum_notice_minutes=EXCLUDED.minimum_notice_minutes,active_for_matchmaking=EXCLUDED.active_for_matchmaking,updated_at=now()`, u.ID, in.SkillLevel, bio, in.PreferredGameDurationMinutes, in.MinimumNoticeMinutes, active)
	if err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM player_style_preferences WHERE user_id=$1`, u.ID); err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	for _, s := range in.Styles {
		if _, err = tx.Exec(r.Context(), `INSERT INTO player_style_preferences(user_id,style) VALUES($1,$2)`, u.ID, s); err != nil {
			http.Error(w, "profile unavailable", 500)
			return
		}
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	h.getProfile(w, r, u.ID)
}
func (h Handler) styles(ctx context.Context, id uuid.UUID) []string {
	rows, err := h.DB.Query(ctx, `SELECT style FROM player_style_preferences WHERE user_id=$1 ORDER BY style`, id)
	if err != nil {
		return []string{}
	}
	defer rows.Close()
	out := []string{}
	for rows.Next() {
		var s string
		if rows.Scan(&s) == nil {
			out = append(out, s)
		}
	}
	return out
}

type progress struct {
	CurrentStep    int   `json:"currentStep"`
	CompletedSteps []int `json:"completedSteps"`
}

func (h Handler) onboarding(w http.ResponseWriter, r *http.Request) {
	u, _ := user(r)
	if r.Method != http.MethodGet && r.Method != http.MethodPut {
		w.WriteHeader(405)
		return
	}
	if r.Method == http.MethodGet {
		var p progress
		err := h.DB.QueryRow(r.Context(), `SELECT current_step,completed_steps FROM onboarding_progress WHERE user_id=$1`, u.ID).Scan(&p.CurrentStep, &p.CompletedSteps)
		if errors.Is(err, pgx.ErrNoRows) {
			p.CompletedSteps = []int{}
		} else if err != nil {
			http.Error(w, "onboarding unavailable", 500)
			return
		}
		writeJSON(w, 200, p)
		return
	}
	var p progress
	if json.NewDecoder(r.Body).Decode(&p) != nil || validateProgress(p) != nil {
		writeError(w, 422, "invalid_onboarding", "Onboarding progress is invalid.")
		return
	}
	_, err := h.DB.Exec(r.Context(), `INSERT INTO onboarding_progress(user_id,current_step,completed_steps) VALUES($1,$2,$3) ON CONFLICT(user_id) DO UPDATE SET current_step=EXCLUDED.current_step,completed_steps=EXCLUDED.completed_steps,updated_at=now()`, u.ID, p.CurrentStep, p.CompletedSteps)
	if err != nil {
		http.Error(w, "onboarding unavailable", 500)
		return
	}
	writeJSON(w, 200, p)
}
func (h Handler) completeOnboarding(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(405)
		return
	}
	u, _ := user(r)
	var count int
	err := h.DB.QueryRow(r.Context(), `SELECT count(*) FROM player_profiles WHERE user_id=$1`, u.ID).Scan(&count)
	if err != nil || count != 1 {
		writeError(w, 422, "profile_incomplete", "Complete profile before finishing onboarding.")
		return
	}
	_, err = h.DB.Exec(r.Context(), `UPDATE users SET onboarding_completed=true,onboarding_completed_at=now(),updated_at=now() WHERE id=$1`, u.ID)
	if err != nil {
		http.Error(w, "onboarding unavailable", 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h Handler) publicProfile(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimPrefix(r.URL.Path, "/api/v1/users/")
	raw = strings.TrimSuffix(raw, "/public-profile")
	id, err := uuid.Parse(strings.Trim(raw, "/"))
	if err != nil || !strings.HasSuffix(r.URL.Path, "/public-profile") {
		writeError(w, 404, "profile_not_found", "Profile not found.")
		return
	}
	h.getPublic(w, r, id)
}
func (h Handler) getPublic(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var out struct {
		UserID         string   `json:"userId"`
		DisplayName    string   `json:"displayName"`
		AvatarURL      *string  `json:"avatarUrl,omitempty"`
		SkillLevel     string   `json:"skillLevel"`
		Styles         []string `json:"styles"`
		Bio            *string  `json:"bio,omitempty"`
		CompletedGames int      `json:"completedGames"`
		PlayedTogether bool     `json:"playedTogether"`
	}
	var avatar, bio *string
	err := h.DB.QueryRow(r.Context(), `SELECT u.id,u.display_name,u.avatar_url,p.skill_level,p.bio FROM users u JOIN player_profiles p ON p.user_id=u.id WHERE u.id=$1 AND u.status='active' AND u.deleted_at IS NULL`, id).Scan(&out.UserID, &out.DisplayName, &avatar, &out.SkillLevel, &bio)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "profile_not_found", "Profile not found.")
		return
	}
	if err != nil {
		http.Error(w, "profile unavailable", 500)
		return
	}
	out.AvatarURL, out.Bio, out.Styles = avatar, bio, h.styles(r.Context(), id)
	writeJSON(w, 200, out)
}
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}}})
}
