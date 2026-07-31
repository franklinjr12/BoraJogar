package notification

import (
	"testing"
	"time"
)

func TestReminderTimesSkipsPastReminders(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	got := ReminderTimes(now.Add(23*time.Hour), now)
	if len(got) != 1 || !got[0].Equal(now.Add(21*time.Hour)) {
		t.Fatalf("got %v", got)
	}
}
func TestReminderTimesSchedulesBoth(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	got := ReminderTimes(now.Add(48*time.Hour), now)
	if len(got) != 2 || !got[0].Equal(now.Add(24*time.Hour)) || !got[1].Equal(now.Add(46*time.Hour)) {
		t.Fatalf("got %v", got)
	}
}
func TestEndpointHashNotPlaintext(t *testing.T) {
	if EndpointHash("https://push.example/sub") == "https://push.example/sub" {
		t.Fatal("endpoint leaked")
	}
}
