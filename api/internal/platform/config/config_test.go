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
	if cfg.MatchLookaheadDays != 14 || cfg.MatchDefaultDurationMinutes != 90 || cfg.MatchDefaultPlayerCount != 4 || cfg.MatchSlotIncrementMinutes != 30 || cfg.MatchMaxSkillDifference != 1 || cfg.MatchMinimumNoticeMinutes != 720 || cfg.MatchProposalExpirationHours != 8 || cfg.MatchMaxProposalsPerUserPerDay != 2 || cfg.MatchRecentPairingLookbackDays != 14 {
		t.Fatalf("unexpected matchmaking defaults: %+v", cfg)
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
