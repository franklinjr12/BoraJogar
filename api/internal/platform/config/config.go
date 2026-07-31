package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	Environment, BaseURL, DatabaseURL string
	Port                              int
	SessionSecret                     string
}

func Load() (Config, error) {
	loadDotEnv(".env")
	port, err := strconv.Atoi(value("APP_PORT", ""))
	if err != nil || port < 1 || port > 65535 {
		return Config{}, errors.New("APP_PORT must be a valid TCP port")
	}
	cfg := Config{Environment: value("APP_ENV", "development"), BaseURL: value("APP_BASE_URL", "http://localhost:5173"), DatabaseURL: value("DATABASE_URL", ""), Port: port, SessionSecret: value("SESSION_SECRET", "")}
	for key, field := range map[string]string{"DATABASE_URL": cfg.DatabaseURL, "SESSION_SECRET": cfg.SessionSecret} {
		if strings.TrimSpace(field) == "" {
			return Config{}, fmt.Errorf("%s is required", key)
		}
	}
	if len(cfg.SessionSecret) < 32 {
		return Config{}, errors.New("SESSION_SECRET must contain at least 32 characters")
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

func loadDotEnv(path string) {
	data, err := os.ReadFile(path)
	if err != nil {
		return
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
}
