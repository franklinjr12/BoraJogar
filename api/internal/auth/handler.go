package auth

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/platform/audit"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

type Handler struct {
	DB            *pgxpool.Pool
	Google        GoogleClient
	Logger        *slog.Logger
	RedirectURL   string
	SecureCookies bool
	Now           func() time.Time
	AdminEmails   string
}

const (
	googleErrorStateInvalid       = "google_state_invalid"
	googleErrorCancelled          = "google_cancelled"
	googleErrorProviderFailed     = "google_provider_failed"
	googleErrorInvalidInvitation  = "invalid_invitation"
	googleErrorEmailAlreadyExists = "google_email_already_registered"
	googleErrorInternal           = "google_internal_error"
)

func (h Handler) logger() *slog.Logger {
	if h.Logger != nil {
		return h.Logger
	}
	return slog.Default()
}

func requestID(r *http.Request) string {
	return r.Header.Get("X-Request-ID")
}

func profileLogAttrs(profile GoogleProfile) []any {
	return []any{
		"email_hash", hash(strings.ToLower(strings.TrimSpace(profile.Email))),
		"google_subject_hash", hash(profile.Subject),
	}
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

func (h Handler) OptionalAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if user, ok := h.userFromRequest(r); ok {
			r = r.WithContext(context.WithValue(r.Context(), userKey{}, user))
		}
		next.ServeHTTP(w, r)
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

// UserFromContext returns authenticated user placed by RequireAuth.
func UserFromContext(ctx context.Context) (User, bool) {
	u, ok := ctx.Value(userKey{}).(User)
	return u, ok
}

// WithUserContext is used by trusted internal callers and handler tests.
func WithUserContext(ctx context.Context, user User) context.Context {
	return context.WithValue(ctx, userKey{}, user)
}

func (h Handler) now() time.Time {
	if h.Now != nil {
		return h.Now()
	}
	return time.Now().UTC()
}

func (h Handler) Register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/v1/auth/google", h.startGoogle)
	mux.HandleFunc("GET /api/v1/auth/google/callback", h.googleCallback)
	mux.HandleFunc("POST /api/v1/auth/email/signup", h.emailSignup)
	mux.HandleFunc("POST /api/v1/auth/email/login", h.emailLogin)
	mux.HandleFunc("POST /api/v1/auth/logout", h.logout)
	mux.HandleFunc("GET /api/v1/me", h.currentUser)
	mux.Handle("/api/v1/admin/invitations", h.RequireAdmin(http.HandlerFunc(h.adminInvitations)))
	mux.Handle("/api/v1/admin/invitations/", h.RequireAdmin(http.HandlerFunc(h.adminInvitationAction)))
}

type emailAuthInput struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DisplayName string `json:"displayName"`
	ReturnTo    string `json:"returnTo"`
}

func (h Handler) emailSignup(w http.ResponseWriter, r *http.Request) {
	var input emailAuthInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Sign-up details are invalid.")
		return
	}
	user, err := h.createEmailUser(r.Context(), input)
	if err != nil {
		switch {
		case errors.Is(err, ErrDuplicateEmail):
			writeError(w, http.StatusConflict, "email_already_registered", "Email is already registered.")
		case errors.Is(err, ErrInvalidCredentials):
			writeError(w, http.StatusUnprocessableEntity, "invalid_credentials", "Email and password are required.")
		default:
			http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		}
		return
	}
	h.startSession(w, r, user, input.ReturnTo)
}

func (h Handler) emailLogin(w http.ResponseWriter, r *http.Request) {
	var input emailAuthInput
	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Login details are invalid.")
		return
	}
	user, err := h.authenticateEmailUser(r.Context(), input.Email, input.Password)
	if err != nil {
		if errors.Is(err, ErrInvalidCredentials) {
			writeError(w, http.StatusUnauthorized, "invalid_credentials", "Email or password is incorrect.")
			return
		}
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	h.startSession(w, r, user, input.ReturnTo)
}

func (h Handler) startGoogle(w http.ResponseWriter, r *http.Request) {
	state, err := randomToken()
	if err != nil {
		h.logger().Error("google auth start failed", "request_id", requestID(r), "reason", "state_generation", "error", err)
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: state, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	if returnTo := safeReturnTo(r.URL.Query().Get("returnTo")); returnTo != "" {
		http.SetCookie(w, &http.Cookie{Name: returnToCookie, Value: url.QueryEscape(returnTo), Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	}
	if invitation := r.URL.Query().Get("invitation"); invitation != "" {
		http.SetCookie(w, &http.Cookie{Name: "borajogar_invitation", Value: invitation, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 600})
	} else {
		http.SetCookie(w, &http.Cookie{Name: "borajogar_invitation", Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	}
	h.logger().Info("google auth started", "request_id", requestID(r), "invitation_present", r.URL.Query().Get("invitation") != "", "return_to_present", r.URL.Query().Get("returnTo") != "")
	http.Redirect(w, r, h.Google.AuthorizationURL(state, h.RedirectURL), http.StatusFound)
}

func (h Handler) googleCallback(w http.ResponseWriter, r *http.Request) {
	stateCookieValue, err := r.Cookie(stateCookie)
	if err != nil {
		h.logger().Warn("google auth callback rejected", "request_id", requestID(r), "reason", "state_cookie_missing")
		h.authError(w, r, googleErrorStateInvalid)
		return
	}
	if !constantTimeEqual(stateCookieValue.Value, r.URL.Query().Get("state")) {
		h.logger().Warn("google auth callback rejected", "request_id", requestID(r), "reason", "state_mismatch")
		h.authError(w, r, googleErrorStateInvalid)
		return
	}
	if oauthError := r.URL.Query().Get("error"); oauthError != "" {
		h.logger().Warn("google auth callback rejected", "request_id", requestID(r), "reason", "provider_error", "provider_error", oauthError)
		if oauthError == "access_denied" {
			h.authError(w, r, googleErrorCancelled)
		} else {
			h.authError(w, r, googleErrorProviderFailed)
		}
		return
	}
	h.logger().Info("google auth callback received", "request_id", requestID(r), "authorization_code_present", r.URL.Query().Get("code") != "")
	invitationCode := ""
	if invitationCookie, cookieErr := r.Cookie("borajogar_invitation"); cookieErr == nil {
		invitationCode = invitationCookie.Value
	}
	returnTo := ""
	if returnToCookieValue, cookieErr := r.Cookie(returnToCookie); cookieErr == nil {
		if decoded, decodeErr := url.QueryUnescape(returnToCookieValue.Value); decodeErr == nil {
			returnTo = safeReturnTo(decoded)
		}
	}
	profile, err := h.Google.Exchange(r.Context(), r.URL.Query().Get("code"), h.RedirectURL)
	if err != nil || profile.Subject == "" || !profile.EmailVerified {
		attrs := []any{"request_id", requestID(r), "reason", "profile_exchange_or_validation"}
		if err != nil {
			attrs = append(attrs, "error", err)
		}
		if profile.Email != "" {
			attrs = append(attrs, profileLogAttrs(profile)...)
		}
		h.logger().Error("google profile validation failed", attrs...)
		h.authError(w, r, googleErrorProviderFailed)
		return
	}
	h.logger().Info("google profile validated", append([]any{"request_id", requestID(r), "invitation_present", invitationCode != ""}, profileLogAttrs(profile)...)...)
	user, created, err := h.upsertUser(r.Context(), profile, invitationCode)
	if err != nil {
		if errors.Is(err, ErrInvalidInvitation) {
			h.logger().Warn("google user validation rejected", append([]any{"request_id", requestID(r), "reason", "invalid_invitation"}, profileLogAttrs(profile)...)...)
			h.authError(w, r, googleErrorInvalidInvitation)
			return
		}
		if errors.Is(err, ErrGoogleEmailAlreadyRegistered) {
			h.logger().Warn("google user validation rejected", append([]any{"request_id", requestID(r), "reason", "email_already_registered"}, profileLogAttrs(profile)...)...)
			h.authError(w, r, googleErrorEmailAlreadyExists)
			return
		}
		h.logger().Error("google user validation failed", append([]any{"request_id", requestID(r), "reason", "database", "error", err}, profileLogAttrs(profile)...)...)
		h.authError(w, r, googleErrorInternal)
		return
	}
	h.logger().Info("google user authenticated", "request_id", requestID(r), "user_id", user.ID, "created", created, "invitation_used", created && invitationCode != "")
	token, err := randomToken()
	if err != nil {
		h.logger().Error("google session token generation failed", "request_id", requestID(r), "user_id", user.ID, "error", err)
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	if err := h.createSession(r.Context(), token, user.ID, r); err != nil {
		h.logger().Error("google session creation failed", "request_id", requestID(r), "user_id", user.ID, "error", err)
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	h.logger().Info("google session created", "request_id", requestID(r), "user_id", user.ID)
	http.SetCookie(w, &http.Cookie{Name: stateCookie, Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: "borajogar_invitation", Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	http.SetCookie(w, &http.Cookie{Name: returnToCookie, Value: "", Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: -1})
	h.setSessionCookie(w, token)
	http.Redirect(w, r, postAuthRedirect(user, returnTo), http.StatusFound)
}

func (h Handler) upsertUser(ctx context.Context, profile GoogleProfile, invitationCode string) (User, bool, error) {
	tx, err := h.DB.Begin(ctx)
	if err != nil {
		return User{}, false, err
	}
	defer tx.Rollback(ctx)
	var user User
	var avatar *string
	err = tx.QueryRow(ctx, `SELECT id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin FROM users WHERE google_subject = $1 AND status = 'active' AND deleted_at IS NULL`, profile.Subject).Scan(&user.ID, &user.DisplayName, &user.Email, &avatar, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
	if err == nil {
		_, err = tx.Exec(ctx, `UPDATE users SET email = $1, display_name = $2, avatar_url = $3, updated_at = now() WHERE id = $4`, profile.Email, profile.Name, nullable(profile.AvatarURL), user.ID)
		if err != nil {
			if isGoogleEmailUniqueViolation(err) {
				return User{}, false, ErrGoogleEmailAlreadyRegistered
			}
			return User{}, false, err
		}
		user.Email, user.DisplayName, user.AvatarURL = profile.Email, profile.Name, nullable(profile.AvatarURL)
		return user, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, err
	}
	var existingGoogleSubject *string
	err = tx.QueryRow(ctx, `SELECT id, google_subject, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin FROM users WHERE lower(email) = lower($1) AND status = 'active' AND deleted_at IS NULL FOR UPDATE`, profile.Email).Scan(&user.ID, &existingGoogleSubject, &user.DisplayName, &user.Email, &user.AvatarURL, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
	if err == nil {
		if existingGoogleSubject != nil && *existingGoogleSubject != profile.Subject {
			return User{}, false, ErrGoogleEmailAlreadyRegistered
		}
		_, err = tx.Exec(ctx, `UPDATE users SET google_subject = $1, email = $2, display_name = $3, avatar_url = $4, updated_at = now() WHERE id = $5`, profile.Subject, profile.Email, profile.Name, nullable(profile.AvatarURL), user.ID)
		if err != nil {
			if isGoogleEmailUniqueViolation(err) {
				return User{}, false, ErrGoogleEmailAlreadyRegistered
			}
			return User{}, false, err
		}
		user.Email, user.DisplayName, user.AvatarURL = profile.Email, profile.Name, nullable(profile.AvatarURL)
		return user, false, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return User{}, false, err
	}

	var invitationID *uuid.UUID
	var maxUses, currentUses int
	var invitationEmail *string
	var expiresAt, disabledAt *time.Time
	if strings.TrimSpace(invitationCode) != "" {
		var id uuid.UUID
		err = tx.QueryRow(ctx, `SELECT id, email, max_uses, current_uses, expires_at, disabled_at FROM invitations WHERE code_hash = $1 FOR UPDATE`, hash(invitationCode)).Scan(&id, &invitationEmail, &maxUses, &currentUses, &expiresAt, &disabledAt)
		if err != nil || disabledAt != nil || currentUses >= maxUses || (expiresAt != nil && !h.now().Before(*expiresAt)) || (invitationEmail != nil && !strings.EqualFold(strings.TrimSpace(*invitationEmail), strings.TrimSpace(profile.Email))) {
			return User{}, false, ErrInvalidInvitation
		}
		invitationID = &id
	}
	newID := uuid.New()
	isAdmin := h.isAdminEmail(profile.Email)
	if err = tx.QueryRow(ctx, `INSERT INTO users (id, google_subject, email, display_name, avatar_url) VALUES ($1, $2, $3, $4, $5) RETURNING id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin`, newID, profile.Subject, profile.Email, profile.Name, nullable(profile.AvatarURL)).Scan(&user.ID, &user.DisplayName, &user.Email, &user.AvatarURL, &user.TimeZone, &user.OnboardingComplete, &isAdmin); err != nil {
		if isGoogleEmailUniqueViolation(err) {
			return User{}, false, ErrGoogleEmailAlreadyRegistered
		}
		return User{}, false, err
	}
	user.IsAdmin = isAdmin
	if invitationID != nil {
		if _, err = tx.Exec(ctx, `UPDATE invitations SET current_uses = current_uses + 1 WHERE id = $1`, *invitationID); err != nil {
			return User{}, false, err
		}
	}
	return user, true, tx.Commit(ctx)
}

func isGoogleEmailUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505" && pgErr.ConstraintName == "users_email_lower_unique_idx"
}

func (h Handler) createEmailUser(ctx context.Context, input emailAuthInput) (User, error) {
	email := strings.ToLower(strings.TrimSpace(input.Email))
	password := input.Password
	displayName := strings.TrimSpace(input.DisplayName)
	if email == "" || password == "" {
		return User{}, ErrInvalidCredentials
	}
	if displayName == "" {
		displayName = strings.Split(email, "@")[0]
	}
	passwordHash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return User{}, err
	}
	user := User{ID: uuid.New(), Email: email, DisplayName: displayName, TimeZone: "UTC", IsAdmin: h.isAdminEmail(email)}
	err = h.DB.QueryRow(ctx, `INSERT INTO users (id, google_subject, email, display_name, password_hash, is_admin) VALUES ($1, NULL, $2, $3, $4, $5) RETURNING id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin`, user.ID, user.Email, user.DisplayName, string(passwordHash), user.IsAdmin).Scan(&user.ID, &user.DisplayName, &user.Email, &user.AvatarURL, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return User{}, ErrDuplicateEmail
		}
		return User{}, err
	}
	return user, nil
}

func (h Handler) authenticateEmailUser(ctx context.Context, email, password string) (User, error) {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || password == "" {
		return User{}, ErrInvalidCredentials
	}
	var user User
	var passwordHash string
	err := h.DB.QueryRow(ctx, `SELECT id, display_name, email, avatar_url, time_zone, onboarding_completed, is_admin, password_hash FROM users WHERE lower(email) = lower($1) AND password_hash IS NOT NULL AND status = 'active' AND deleted_at IS NULL`, email).Scan(&user.ID, &user.DisplayName, &user.Email, &user.AvatarURL, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin, &passwordHash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return User{}, ErrInvalidCredentials
		}
		return User{}, err
	}
	if bcrypt.CompareHashAndPassword([]byte(passwordHash), []byte(password)) != nil {
		return User{}, ErrInvalidCredentials
	}
	return user, nil
}

func (h Handler) startSession(w http.ResponseWriter, r *http.Request, user User, returnTo string) {
	token, err := randomToken()
	if err != nil {
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	if err := h.createSession(r.Context(), token, user.ID, r); err != nil {
		http.Error(w, "authentication unavailable", http.StatusInternalServerError)
		return
	}
	h.setSessionCookie(w, token)
	writeJSON(w, http.StatusOK, map[string]string{"redirectTo": postAuthRedirect(user, returnTo)})
}

func (h Handler) setSessionCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookie, Value: token, Path: "/", HttpOnly: true, Secure: h.SecureCookies, SameSite: http.SameSiteLaxMode, MaxAge: 60 * 60 * 24 * 30})
}

func postAuthRedirect(user User, returnTo string) string {
	if safe := safeReturnTo(returnTo); safe != "" {
		return safe
	}
	if !user.OnboardingComplete {
		return "/onboarding"
	}
	return "/dashboard"
}

func safeReturnTo(value string) string {
	value = strings.TrimSpace(value)
	if value == "" || !strings.HasPrefix(value, "/") || strings.HasPrefix(value, "//") || strings.Contains(value, "\\") {
		return ""
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.IsAbs() || parsed.Host != "" {
		return ""
	}
	return parsed.RequestURI()
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
	if h.DB == nil {
		return User{}, false
	}
	cookie, err := r.Cookie(sessionCookie)
	if err != nil {
		return User{}, false
	}
	var user User
	var avatar *string
	err = h.DB.QueryRow(r.Context(), `SELECT u.id, u.display_name, u.email, u.avatar_url, u.time_zone, u.onboarding_completed, u.is_admin FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = $1 AND s.expires_at > now() AND u.status = 'active' AND u.deleted_at IS NULL`, hash(cookie.Value)).Scan(&user.ID, &user.DisplayName, &user.Email, &avatar, &user.TimeZone, &user.OnboardingComplete, &user.IsAdmin)
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
		if err := audit.Record(r.Context(), h.DB, admin.ID, audit.InvitationCreated, "invitation", id, nil); err != nil {
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
	admin, _ := UserFromContext(r.Context())
	_, err = h.DB.Exec(r.Context(), `UPDATE invitations SET disabled_at = now() WHERE id = $1`, id)
	if err != nil {
		http.Error(w, "failed to disable invitation", http.StatusInternalServerError)
		return
	}
	if err := audit.Record(r.Context(), h.DB, admin.ID, audit.InvitationDisabled, "invitation", id, nil); err != nil {
		http.Error(w, "failed to disable invitation", http.StatusInternalServerError)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h Handler) authError(w http.ResponseWriter, r *http.Request, code string) {
	target := url.URL{Path: "/login", RawQuery: url.Values{"error": {code}}.Encode()}
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
