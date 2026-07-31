package config

import "testing"

func TestLoadRejectsMissingSecrets(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "short")
	if _, err := Load(); err == nil {
		t.Fatal("expected invalid session secret")
	}
}
func TestLoad(t *testing.T) {
	t.Setenv("APP_PORT", "8080")
	t.Setenv("DATABASE_URL", "postgres://example")
	t.Setenv("SESSION_SECRET", "12345678901234567890123456789012")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.Address() != ":8080" {
		t.Fatalf("address = %s", cfg.Address())
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
