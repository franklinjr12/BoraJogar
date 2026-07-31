package availability

import (
	"testing"
	"time"
)

func validRule() Rule {
	return Rule{ID: "rule-1", Weekday: 1, Start: "07:00", End: "09:00", Timezone: "America/Sao_Paulo", ValidFrom: time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC), Active: true, AreaIDs: []string{"area-1"}}
}
func TestValidateRuleRejectsCrossMidnightAndMissingLocation(t *testing.T) {
	r := validRule()
	r.End = "06:00"
	if err := ValidateRule(r); err == nil {
		t.Fatal("expected cross-midnight validation error")
	}
	r = validRule()
	r.AreaIDs = nil
	if err := ValidateRule(r); err == nil {
		t.Fatal("expected location validation error")
	}
}
func TestExpandConvertsLocalTimeToUTC(t *testing.T) {
	r := validRule()
	items, err := Expand(r, nil, time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC), time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 1 {
		t.Fatalf("got %d occurrences", len(items))
	}
	if got := items[0].StartsAt.Format(time.RFC3339); got != "2026-07-27T10:00:00Z" {
		t.Fatalf("got %s", got)
	}
}
func TestExpandAppliesExceptions(t *testing.T) {
	r := validRule()
	ex := []Exception{{ID: "ex-1", Date: time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC), Type: UnavailableInterval, Start: "08:00", End: "08:30", Timezone: r.Timezone}}
	items, err := Expand(r, ex, time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC), time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC))
	if err != nil {
		t.Fatal(err)
	}
	if len(items) != 2 || items[0].EndsAt.Sub(items[0].StartsAt) != time.Hour {
		t.Fatalf("unexpected split: %#v", items)
	}
}
func TestValidateExceptionAllDay(t *testing.T) {
	if err := ValidateException(Exception{Type: UnavailableAllDay, Timezone: "UTC", Start: "08:00"}); err == nil {
		t.Fatal("expected all-day interval rejection")
	}
}
