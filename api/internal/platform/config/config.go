package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment, BaseURL, DatabaseURL, GoogleClientID, GoogleClientSecret, GoogleRedirectURL, GoogleMapsAPIKey, GoogleMapsSecret, AdminEmails string
	Port                                                                                                                                      int
	SessionSecret                                                                                                                             string
	MatchLookaheadDays, MatchDefaultDurationMinutes, MatchDefaultPlayerCount, MatchSlotIncrementMinutes                                       int
	MatchMaxSkillDifference, MatchMinimumNoticeMinutes, MatchProposalExpirationHours                                                          int
	MatchMaxProposalsPerUserPerDay, MatchRecentPairingLookbackDays                                                                            int
}

func Load() (Config, error) {
	if !loadDotEnv(".env") {
		loadDotEnv("../.env")
	}
	port, err := strconv.Atoi(value("APP_PORT", ""))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, errors.New("APP_PORT must be a valid TCP port")
	}
	cfg := Config{Environment: value("APP_ENV", "development"), BaseURL: value("APP_BASE_URL", "http://localhost:5173"), DatabaseURL: value("DATABASE_URL", ""), GoogleClientID: value("GOOGLE_CLIENT_ID", ""), GoogleClientSecret: value("GOOGLE_CLIENT_SECRET", ""), GoogleRedirectURL: value("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/v1/auth/google/callback"), GoogleMapsAPIKey: value("GOOGLE_MAPS_API_KEY", ""), GoogleMapsSecret: value("GOOGLE_MAPS_SECRET", ""), AdminEmails: value("ADMIN_EMAILS", ""), Port: port, SessionSecret: value("SESSION_SECRET", ""), MatchLookaheadDays: intValue("MATCH_LOOKAHEAD_DAYS", 14), MatchDefaultDurationMinutes: intValue("MATCH_DEFAULT_DURATION_MINUTES", 90), MatchDefaultPlayerCount: intValue("MATCH_DEFAULT_PLAYER_COUNT", 4), MatchSlotIncrementMinutes: intValue("MATCH_SLOT_INCREMENT_MINUTES", 30), MatchMaxSkillDifference: intValue("MATCH_MAX_SKILL_DIFFERENCE", 1), MatchMinimumNoticeMinutes: intValue("MATCH_MINIMUM_NOTICE_MINUTES", 720), MatchProposalExpirationHours: intValue("MATCH_PROPOSAL_EXPIRATION_HOURS", 8), MatchMaxProposalsPerUserPerDay: intValue("MATCH_MAX_PROPOSALS_PER_USER_PER_DAY", 2), MatchRecentPairingLookbackDays: intValue("MATCH_RECENT_PAIRING_LOOKBACK_DAYS", 14)}
	for key, field := range map[string]string{"DATABASE_URL": cfg.DatabaseURL, "SESSION_SECRET": cfg.SessionSecret} {
		if strings.TrimSpace(field) == "" {
			return Config{}, fmt.Errorf("%s is required", key)
		}
	}
	if len(cfg.SessionSecret) < 32 {
		return Config{}, errors.New("SESSION_SECRET must contain at least 32 characters")
	}
	if cfg.MatchLookaheadDays < 1 || cfg.MatchDefaultDurationMinutes < 1 || cfg.MatchDefaultPlayerCount < 2 || cfg.MatchSlotIncrementMinutes < 1 || cfg.MatchMaxSkillDifference < 0 || cfg.MatchMinimumNoticeMinutes < 0 || cfg.MatchProposalExpirationHours < 1 || cfg.MatchMaxProposalsPerUserPerDay < 1 || cfg.MatchRecentPairingLookbackDays < 0 {
		return Config{}, errors.New("matchmaking configuration is invalid")
	}
	return cfg, nil
}

func (c Config) Address() string { return fmt.Sprintf(":%d", c.Port) }
func value(key, fallback string) string {
	if v, ok := os.LookupEnv(key); ok {
		return v
	}
	return fallback
}

func intValue(key string, fallback int) int {
	v, err := strconv.Atoi(value(key, strconv.Itoa(fallback)))
	if err != nil {
		return fallback
	}
	return v
}

func loadDotEnv(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key, value := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
		if _, exists := os.LookupEnv(key); !exists {
			_ = os.Setenv(key, strings.Trim(value, "\"'"))
		}
	}
	return true
}
