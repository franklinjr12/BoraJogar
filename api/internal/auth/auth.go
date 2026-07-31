package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

const sessionCookie = "borajogar_session"
const stateCookie = "borajogar_oauth_state"

var ErrInvalidInvitation = errors.New("invalid invitation")

type User struct {
	ID                 uuid.UUID
	DisplayName        string
	Email              string
	AvatarURL          *string
	TimeZone           string
	OnboardingComplete bool
	IsAdmin            bool
}

type Store struct{ DB *pgxpool.Pool }

func hash(value string) string {
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func GenerateInvitationCode() (string, string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", "", fmt.Errorf("generate invitation code: %w", err)
	}
	code := base64.RawURLEncoding.EncodeToString(b)
	return code, hash(code), nil
}

func ValidateInvitation(ctx context.Context, db *pgxpool.Pool, code, email string, now time.Time) error {
	if strings.TrimSpace(code) == "" {
		return ErrInvalidInvitation
	}
	var expiresAt *time.Time
	var disabledAt *time.Time
	var invitationEmail *string
	var maxUses, currentUses int
	err := db.QueryRow(ctx, `SELECT email, max_uses, current_uses, expires_at, disabled_at FROM invitations WHERE code_hash = $1`, hash(code)).Scan(&invitationEmail, &maxUses, &currentUses, &expiresAt, &disabledAt)
	if err != nil || disabledAt != nil || currentUses >= maxUses || (expiresAt != nil && !now.Before(*expiresAt)) || (invitationEmail != nil && !strings.EqualFold(strings.TrimSpace(*invitationEmail), strings.TrimSpace(email))) {
		return ErrInvalidInvitation
	}
	return nil
}

type GoogleProfile struct {
	Subject, Email, Name, AvatarURL string
	EmailVerified                   bool
}
type GoogleClient interface {
	AuthorizationURL(state, redirectURL string) string
	Exchange(context.Context, string, string) (GoogleProfile, error)
}

type GoogleHTTPClient struct {
	Client                 *http.Client
	ClientID, ClientSecret string
}

func (c GoogleHTTPClient) AuthorizationURL(state, redirectURL string) string {
	v := url.Values{"client_id": {c.ClientID}, "redirect_uri": {redirectURL}, "response_type": {"code"}, "scope": {"openid email profile"}, "state": {state}, "access_type": {"online"}}
	return "https://accounts.google.com/o/oauth2/v2/auth?" + v.Encode()
}
func (c GoogleHTTPClient) Exchange(ctx context.Context, code, redirectURL string) (GoogleProfile, error) {
	form := url.Values{"code": {code}, "client_id": {c.ClientID}, "client_secret": {c.ClientSecret}, "redirect_uri": {redirectURL}, "grant_type": {"authorization_code"}}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://oauth2.googleapis.com/token", strings.NewReader(form.Encode()))
	if err != nil {
		return GoogleProfile{}, err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	res, err := c.Client.Do(req)
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("exchange google code: %w", err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		return GoogleProfile{}, errors.New("google authorization failed")
	}
	var token struct {
		AccessToken string `json:"access_token"`
	}
	if err := json.NewDecoder(res.Body).Decode(&token); err != nil {
		return GoogleProfile{}, err
	}
	profileReq, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://openidconnect.googleapis.com/v1/userinfo", nil)
	if err != nil {
		return GoogleProfile{}, err
	}
	profileReq.Header.Set("Authorization", "Bearer "+token.AccessToken)
	profileRes, err := c.Client.Do(profileReq)
	if err != nil {
		return GoogleProfile{}, fmt.Errorf("fetch google profile: %w", err)
	}
	defer profileRes.Body.Close()
	if profileRes.StatusCode != http.StatusOK {
		return GoogleProfile{}, errors.New("google profile unavailable")
	}
	var profile struct {
		Sub, Email, Name, Picture string
		EmailVerified             bool `json:"email_verified"`
	}
	if err := json.NewDecoder(profileRes.Body).Decode(&profile); err != nil {
		return GoogleProfile{}, err
	}
	return GoogleProfile{Subject: profile.Sub, Email: profile.Email, Name: profile.Name, AvatarURL: profile.Picture, EmailVerified: profile.EmailVerified}, nil
}

func randomToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}
func constantTimeEqual(a, b string) bool {
	return subtle.ConstantTimeCompare([]byte(a), []byte(b)) == 1
}
