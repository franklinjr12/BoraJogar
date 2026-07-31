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
}
