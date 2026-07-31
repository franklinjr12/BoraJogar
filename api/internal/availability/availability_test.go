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

func TestValidateRuleRejectsInvalidTimezoneAndRange(t *testing.T) {
	r := validRule()
	r.Timezone = "Mars/Phobos"
	if err := ValidateRule(r); err == nil {
		t.Fatal("expected invalid timezone rejection")
	}
	r = validRule()
	r.ValidUntil = ptrTime(time.Date(2026, 7, 26, 0, 0, 0, 0, time.UTC))
	if err := ValidateRule(r); err == nil {
		t.Fatal("expected invalid validity range rejection")
	}
}

func TestExpandAllDayAndAvailableExceptions(t *testing.T) {
	r := validRule()
	from := time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC)
	to := time.Date(2026, 7, 29, 0, 0, 0, 0, time.UTC)
	items, err := Expand(r, []Exception{{ID: "day-off", Date: from, Type: UnavailableAllDay, Timezone: r.Timezone}}, from, to)
	if err != nil || len(items) != 0 {
		t.Fatalf("all-day exception = %#v, err=%v", items, err)
	}
	items, err = Expand(r, []Exception{{ID: "extra", Date: from, Type: AvailableInterval, Start: "10:00", End: "11:00", Timezone: r.Timezone}}, from, to)
	if err != nil || len(items) != 1 || items[0].SourceType != "exception" || items[0].StartsAt.Format(time.RFC3339) != "2026-07-27T13:00:00Z" {
		t.Fatalf("available exception = %#v, err=%v", items, err)
	}
}

func TestExpandAvailableExceptionRejectsUnavailableType(t *testing.T) {
	_, err := ExpandAvailableException(Exception{Type: UnavailableInterval, Timezone: "UTC", Start: "08:00", End: "09:00"})
	if err == nil {
		t.Fatal("expected available-interval type rejection")
	}
}

func ptrTime(value time.Time) *time.Time { return &value }
