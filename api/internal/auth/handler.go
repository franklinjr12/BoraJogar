package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct {
	DB            *pgxpool.Pool
	Google        GoogleClient
	RedirectURL   string
	SecureCookies bool
	Now           func() time.Time
	AdminEmails   string
}

func (h Handler) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, ok := h.userFromRequest(r)
		if !ok {
			writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required.")
			return
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), userKey{}, user)))
	})
}
func (h Handler) RequireAdmin(next http.Handler) http.Handler {
	return h.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		user, _ := r.Context().Value(userKey{}).(User)
		if !user.IsAdmin {
			writeError(w, http.StatusForbidden, "forbidden", "Administrator access required.")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

type userKey struct{}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now().UTC()
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/auth/google", h.startGoogle)
	mux.HandleFunc("GET /api/v1/auth/google/callback", h.googleCallback)
	mux.HandleFunc("POST /api/v1/auth/logout", h.logout)
	mux.HandleFunc("GET /api/v1/me", h.currentUser)
	mux.Handle("/api/v1/admin/invitations", h.RequireAdmin(http.HandlerFunc(h.adminInvitations)))
	mux.Handle("/api/v1/admin/invitations/", h.RequireAdmin(http.HandlerFunc(h.adminInvitationAction)))
}

func (h Handler) startGoogle(w http.ResponseWriter, r *http.Request) {
	state, err := randomToken()
	if err != nil {
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	if invitation := r.URL.Query().Get("invitation"); invitation != "" {
		http.SetCookie(w, &http.Cookie{Name: "borajogar_invitation", Value: invitation, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	}
	http.Redirect(w, r, h.Google.AuthorizationURL(state, h.RedirectURL), http.StatusFound)
}

func (h Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	stateCookieValue, err := r.Cookie(stateCookie)
	if err != nil || !constantTimeEqual(stateCookieValue.Value, r.URL.Query().Get("state")) {
		h.authError(w, r, "Invalid sign-in state. Please try again.")
		return
	}
	if oauthError := r.URL.Query().Get("error"); oauthError != "" {
		h.authError(w, r, "Google sign-in was cancelled.")
		return
	}
	invitationCode := ""
	if invitationCookie, cookieErr := r.Cookie("borajogar_invitation"); cookieErr == nil {
		invitationCode = invitationCookie.Value
	}
	profile, err := h.Google.Exchange(r.Context(), r.URL.Query().Get("code"), h.RedirectURL)
	if err != nil || profile.Subject == "" || !profile.EmailVerified {
		h.authError(w, r, "Google could not verify this account.")
		return
	}
	user, err := h.upsertUser(r.Context(), profile, invitationCode)
	if err != nil {
		if errors.Is(err, ErrInvalidInvitation) {
			h.authError(w, r, "A valid invitation is required for new accounts.")
			return
		}
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	token, err := randomToken()
	if err != nil {
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	if err := h.createSession(r.Context(), token, user.ID, r); err != nil {
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: "borajogar_invitation", Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 60 * 60 * 24 * 30})
	redirect := "/home"
	if !user.OnboardingComplete {
		redirect = "/onboarding"
	}
	http.Redirect(w, r, redirect, http.StatusFound)
}

func (h Handler) upsertUser(ctx context.Context, profile GoogleProfile, invitationCode string) (User, error) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback(ctx)
	var user User
	var avatar *string
	err = tx.QueryRow(ctx, `SELECT id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin FROM users WHERE google_subject = $1`, profile.Subject).Scan(&user.ID, &user.DisplayName, &user.Email, &avatar, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE users SET email = $1, display_name = $2, avatar_url = $3, updated_at = now() WHERE id = $4`, profile.Email, profile.Name, nullable(profile.AvatarURL), user.ID)
		if err != nil {
			return User{}, err
		}
		user.Email, user.DisplayName, user.AvatarURL = profile.Email, profile.Name, nullable(profile.AvatarURL)
		return user, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, err
	}
	var invitationID uuid.UUID
	var maxUses, currentUses int
	var invitationEmail *string
	var expiresAt, disabledAt *time.Time
	err = tx.QueryRow(ctx, `SELECT id, email, max_uses, current_uses, expires_at, disabled_at FROM invitations WHERE code_hash = $1 FOR UPDATE`, hash(invitationCode)).Scan(&invitationID, &invitationEmail, &maxUses, &currentUses, &expiresAt, &disabledAt)
	if err != nil || disabledAt != nil || currentUses >= maxUses || (expiresAt != nil && !h.now().Before(*expiresAt)) || (invitationEmail != nil && !strings.EqualFold(strings.TrimSpace(*invitationEmail), strings.TrimSpace(profile.Email))) {
		return User{}, ErrInvalidInvitation
	}
	newID := uuid.New()
	isAdmin := h.isAdminEmail(profile.Email)
	if err = tx.QueryRow(ctx, `INSERT INTO users (id, google_subject, email, display_name, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin`, newID, profile.Subject, profile.Email, profile.Name, nullable(profile.AvatarURL)).Scan(&user.ID, &user.DisplayName, &user.Email, &user.AvatarURL, &user.TimeZone, &user.OnboardingComplete, &isAdmin); err != nil {
		return User{}, err
	}
	user.IsAdmin = isAdmin
	if _, err = tx.Exec(ctx, `UPDATE invitations SET current_uses = current_uses + 1 WHERE id = $1`, invitationID); err != nil {
		return User{}, err
	}
	return user, tx.Commit(ctx)
}

func nullable(value string) *string {
	if value == "" {
		return nil
	}
	return &value
}
func (h Handler) isAdminEmail(email string) bool {
	for _, candidate := range strings.Split(h.AdminEmails, ",") {
		if strings.TrimSpace(candidate) != "" && strings.EqualFold(strings.TrimSpace(candidate), strings.TrimSpace(email)) {
			return true
		}
	}
	return false
}
func (h Handler) createSession(ctx context.Context, token string, userID uuid.UUID, r *http.Request) error {
	_, err := h.DB.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at, user_agent, ip_hash) VALUES ($1, $2, $3, $4, $5)`, hash(token), userID, h.now().Add(30*24*time.Hour), r.UserAgent(), ipHash(r.RemoteAddr))
	return err
}
func ipHash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (h Handler) currentUser(w http.ResponseWriter, r *http.Request) {
	user, ok := h.userFromRequest(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Authentication required.")
		return
	}
	writeJSON(w, http.StatusOK, user)
}
func (h Handler) userFromRequest(r *http.Request) (User, bool) {
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return User{}, false
	}
	var user User
	var avatar *string
	err = h.DB.QueryRow(r.Context(), `SELECT u.id, u.display_name, u.email, u.avatar_url, u.time_zone, u.onboarding_completed, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now()`, hash(cookie.Value)).Scan(&user.ID, &user.DisplayName, &user.Email, &avatar, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
	if err != nil {
		return User{}, false
	}
	user.AvatarURL = avatar
	return user, true
}
func (h Handler) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookie); err == nil {
		_, _ = h.DB.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, hash(cookie.Value))
	}
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	w.WriteHeader(http.StatusNoContent)
}
func (h Handler) adminInvitations(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := h.DB.Query(r.Context(), `SELECT id, email, max_uses, current_uses, expires_at, disabled_at, created_at FROM invitations ORDER BY created_at DESC`)
		if err != nil {
			http.Error(w, "failed to load invitations", http.StatusInternalServerError)
			return
		}
		defer rows.Close()
		type invitation struct {
			ID                               uuid.UUID `json:"id"`
			Email                            *string   `json:"email"`
			MaxUses, CurrentUses             int
			ExpiresAt, DisabledAt, CreatedAt *time.Time
		}
		items := []invitation{}
		for rows.Next() {
			var item invitation
			if err := rows.Scan(&item.ID, &item.Email, &item.MaxUses, &item.CurrentUses, &item.ExpiresAt, &item.DisabledAt, &item.CreatedAt); err != nil {
				http.Error(w, "failed to load invitations", http.StatusInternalServerError)
				return
			}
			items = append(items, item)
		}
		writeJSON(w, http.StatusOK, items)
	case http.MethodPost:
		var input struct {
			Email     *string    `json:"email"`
			MaxUses   int        `json:"maxUses"`
			ExpiresAt *time.Time `json:"expiresAt"`
		}
		if err := json.NewDecoder(r.Body).Decode(&input); err != nil || input.MaxUses < 1 || input.MaxUses > 10000 {
			writeError(w, http.StatusUnprocessableEntity, "invalid_invitation", "Invitation limits are invalid.")
			return
		}
		code, codeHash, err := GenerateInvitationCode()
		if err != nil {
			http.Error(w, "failed to create invitation", http.StatusInternalServerError)
			return
		}
		id := uuid.New()
		admin, _ := r.Context().Value(userKey{}).(User)
		_, err = h.DB.Exec(r.Context(), `INSERT INTO invitations (id, code_hash, created_by_user_id, email, max_uses, expires_at) VALUES ($1, $2, $3, $4, $5, $6)`, id, codeHash, admin.ID, input.Email, input.MaxUses, input.ExpiresAt)
		if err != nil {
			http.Error(w, "failed to create invitation", http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, map[string]any{"id": id, "code": code})
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (h Handler) adminInvitationAction(w http.ResponseWriter, r *http.Request) {
	raw := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/invitations/")
	raw = strings.TrimSuffix(raw, "/disable")
	id, err := uuid.Parse(strings.TrimSuffix(raw, "/"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "Invitation not found.")
		return
	}
	if r.Method != http.MethodPost || !strings.HasSuffix(r.URL.Path, "/disable") {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	_, err = h.DB.Exec(r.Context(), `UPDATE invitations SET disabled_at = now() WHERE id = $1`, id)
	if err != nil {
		http.Error(w, "failed to disable invitation", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
func (h Handler) authError(w http.ResponseWriter, r *http.Request, message string) {
	target := url.URL{Path: "/login", RawQuery: url.Values{"error": {message}}.Encode()}
	http.Redirect(w, r, target.String(), http.StatusFound)
}
func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}}})
}
