package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestLoadRejectsMissingSecrets(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid session secret")
	}
}

func TestLoadUsesParentDotEnvWhenWorkingDirectoryFileIsMissing(t *testing.T) {
	root := t.TempDir()
	child := filepath.Join(root, "api")
	if err := os.Mkdir(child, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, ".env"), []byte("APP_BASE_URL=http://fallback.test\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	t.Chdir(child)
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")

	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.BaseURL != "http://fallback.test" {
		t.Fatalf("base URL = %q, want fallback value", cfg.BaseURL)
	}
}

func TestLoad(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
	t.Setenv("GOOGLE_MAPS_API_KEY", "maps-key")
	t.Setenv("GOOGLE_MAPS_SECRET", "maps-secret")
	t.Setenv("SMTP_HOST", "smtp.resend.com")
	t.Setenv("SMTP_PORT", "587")
	t.Setenv("SMTP_USERNAME", "resend")
	t.Setenv("SMTP_PASSWORD", "smtp-key")
	t.Setenv("SMTP_FROM_ADDRESS", "no-reply@notify.example.com")
	t.Setenv("SMTP_FROM_NAME", "Bora Jogar")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address() != ":8080" {
		t.Fatalf("address = %s", cfg.Address())
	}
	if cfg.GoogleMapsAPIKey != "maps-key" || cfg.GoogleMapsSecret != "maps-secret" {
		t.Fatalf("unexpected Google Maps config: %#v", cfg)
	}
	if cfg.SMTPHost != "smtp.resend.com" || cfg.SMTPPort != 587 || cfg.SMTPUsername != "resend" || cfg.SMTPPassword != "smtp-key" || cfg.SMTPFromAddress != "no-reply@notify.example.com" || cfg.SMTPFromName != "Bora Jogar" {
		t.Fatalf("unexpected SMTP config: %#v", cfg)
	}
	if cfg.MatchLookaheadDays != 14 || cfg.MatchDefaultDurationMinutes != 90 || cfg.MatchDefaultPlayerCount != 4 || cfg.MatchSlotIncrementMinutes != 30 || cfg.MatchMaxSkillDifference != 1 || cfg.MatchMinimumNoticeMinutes != 720 || cfg.MatchProposalExpirationHours != 8 || cfg.MatchMaxProposalsPerUserPerDay != 2 || cfg.MatchRecentPairingLookbackDays != 14 {
		t.Fatalf("unexpected matchmaking defaults: %+v", cfg)
	}
}

func TestLoadRequiresSMTPConfigurationInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("APP_BASE_URL", "https://borajogar.example")
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
	t.Setenv("GOOGLE_CLIENT_ID", "client-id")
	t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
	t.Setenv("GOOGLE_REDIRECT_URL", "https://borajogar.example/api/v1/auth/google/callback")
	t.Setenv("SMTP_HOST", "")
	t.Setenv("SMTP_USERNAME", "")
	t.Setenv("SMTP_PASSWORD", "")

	if _, err := Load(); err == nil {
		t.Fatal("expected production SMTP configuration error")
	}
}

func TestLoadRequiresGoogleConfigurationInProduction(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("APP_BASE_URL", "https://borajogar.example")
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
	t.Setenv("GOOGLE_CLIENT_ID", "")
	t.Setenv("GOOGLE_CLIENT_SECRET", "")
	t.Setenv("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/v1/auth/google/callback")
	t.Setenv("SMTP_HOST", "smtp.example")
	t.Setenv("SMTP_USERNAME", "username")
	t.Setenv("SMTP_PASSWORD", "password")
	t.Setenv("SMTP_FROM_ADDRESS", "no-reply@example.com")

	if _, err := Load(); err == nil {
		t.Fatal("expected production Google OAuth configuration error")
	}
}

func TestLoadRejectsNonHTTPSProductionURLs(t *testing.T) {
	for _, test := range []struct {
		name        string
		baseURL     string
		redirectURL string
	}{
		{name: "base URL", baseURL: "http://borajogar.example", redirectURL: "https://borajogar.example/api/v1/auth/google/callback"},
		{name: "redirect URL", baseURL: "https://borajogar.example", redirectURL: "http://borajogar.example/api/v1/auth/google/callback"},
	} {
		t.Run(test.name, func(t *testing.T) {
			t.Setenv("APP_ENV", "production")
			t.Setenv("APP_BASE_URL", test.baseURL)
			t.Setenv("APP_PORT", "8080")
			t.Setenv("DATABASE_URL", "postgres://example")
			t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
			t.Setenv("GOOGLE_CLIENT_ID", "client-id")
			t.Setenv("GOOGLE_CLIENT_SECRET", "client-secret")
			t.Setenv("GOOGLE_REDIRECT_URL", test.redirectURL)
			t.Setenv("SMTP_HOST", "smtp.example")
			t.Setenv("SMTP_USERNAME", "username")
			t.Setenv("SMTP_PASSWORD", "password")
			t.Setenv("SMTP_FROM_ADDRESS", "no-reply@example.com")

			if _, err := Load(); err == nil {
				t.Fatal("expected production HTTPS URL error")
			}
		})
	}
}

func TestLoadRejectsInvalidMatchmakingConfiguration(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
	t.Setenv("MATCH_DEFAULT_PLAYER_COUNT", "1")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid matchmaking configuration")
	}
}
