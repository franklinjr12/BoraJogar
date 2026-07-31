package game

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestBuildICSUsesStableUIDAndEscapesFields(t *testing.T) {
	address := "Rua A, 10; quadra"
	title := "Jogo, sábado"
	description := "Levar água\nconfirmar presença"
	r := httptest.NewRequest("GET", "https://play.example/games/abc", nil)
	got := buildICS(gameDetails{gameSummary: gameSummary{ID: "abc", Title: &title, StartsAt: time.Date(2026, 8, 1, 12, 0, 0, 0, time.FixedZone("BRT", -3*60*60)), EndsAt: time.Date(2026, 8, 1, 13, 30, 0, 0, time.FixedZone("BRT", -3*60*60)), VenueName: "Praia Central", AddressLabel: &address, Latitude: -23.5, Longitude: -46.6}, Description: &description}, r)
	for _, want := range []string{"UID:abc@borajogar", "DTSTART:20260801T150000Z", "LOCATION:Praia Central\\, Rua A\\, 10\\; quadra", "DESCRIPTION:Levar água\\nconfirmar presença", "URL:https://play.example/games/abc"} {
		if !strings.Contains(got, want) {
			t.Fatalf("ICS missing %q in %q", want, got)
		}
	}
}
