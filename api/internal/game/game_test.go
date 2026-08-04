package game

import (
	"strings"
	"testing"
	"time"
)

func TestValidateCreateDefaultsAndRules(t *testing.T) {
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	start, end, err := ValidateCreate(CreateInput{StartsAt: "2026-07-31T12:00:00-03:00", DurationMinutes: 90, VenueID: "venue", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "link-only"}, now)
	if err != nil || !start.Equal(time.Date(2026, 7, 31, 15, 0, 0, 0, time.UTC)) || end.Sub(start) != 90*time.Minute {
		t.Fatalf("validation = %v, %v, %v", start, end, err)
	}
	for _, in := range []CreateInput{{StartsAt: "2026-07-30T12:00:00Z", DurationMinutes: 90, VenueID: "v", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "public"}, {StartsAt: "2026-07-31T12:00:00Z", DurationMinutes: 90, VenueID: "v", Capacity: 1, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "public"}, {StartsAt: "2026-07-31T12:00:00Z", DurationMinutes: 90, VenueID: "v", Capacity: 4, MinimumSkillLevel: "advanced", MaximumSkillLevel: "beginner", Visibility: "public"}} {
		if _, _, err := ValidateCreate(in, now); err == nil {
			t.Fatalf("expected invalid input: %+v", in)
		}
	}
}

func TestSkillAllowed(t *testing.T) {
	if !SkillAllowed("beginner", "advanced", "intermediate") || SkillAllowed("beginner", "advanced", "competitive") {
		t.Fatal("skill range failed")
	}
}

func TestValidateCreateRejectsPastAndInvalidVisibility(t *testing.T) {
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	_, _, err := ValidateCreate(CreateInput{StartsAt: "2026-07-30T11:59:00Z", DurationMinutes: 90, VenueID: "venue", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "public"}, now)
	if err == nil {
		t.Fatal("past game accepted")
	}
	if !strings.Contains(err.Error(), "startsAt must be in the future") || strings.Contains(err.Error(), "RFC3339") {
		t.Fatalf("past error = %v", err)
	}
	_, _, err = ValidateCreate(CreateInput{StartsAt: "2026-07-31T12:00:00Z", DurationMinutes: 90, VenueID: "venue", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "secret"}, now)
	if err == nil {
		t.Fatal("invalid visibility accepted")
	}
}

func TestValidateCreateSeparatesMalformedStartFromPastStart(t *testing.T) {
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	_, _, err := ValidateCreate(CreateInput{StartsAt: "tomorrow", DurationMinutes: 90, VenueID: "venue", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "public"}, now)
	if err == nil || !strings.Contains(err.Error(), "startsAt must use RFC3339") {
		t.Fatalf("malformed error = %v", err)
	}
}

func TestValidateCreateCoversDurationAndSkillBoundaries(t *testing.T) {
	now := time.Date(2026, 7, 31, 12, 0, 0, 0, time.UTC)
	in := CreateInput{StartsAt: now.Add(time.Hour).Format(time.RFC3339), DurationMinutes: 90, VenueID: "venue", Capacity: 2, MinimumSkillLevel: "learning", MaximumSkillLevel: "competitive", Visibility: "public"}
	starts, ends, err := ValidateCreate(in, now)
	if err != nil || !ends.Equal(starts.Add(90*time.Minute)) {
		t.Fatalf("duration defaults = %v, %v, err=%v", starts, ends, err)
	}
	for _, capacity := range []int{1, 13} {
		in.Capacity = capacity
		if _, _, err := ValidateCreate(in, now); err == nil {
			t.Fatalf("capacity %d accepted", capacity)
		}
	}
	in.Capacity = 2
	in.MinimumSkillLevel = "advanced"
	in.MaximumSkillLevel = "beginner"
	if _, _, err := ValidateCreate(in, now); err == nil {
		t.Fatal("reversed skill range accepted")
	}
}

func TestSkillAllowedRejectsUnknownAndOutOfRangeLevels(t *testing.T) {
	for _, tc := range []struct{ min, max, user string }{
		{"beginner", "advanced", "learning"},
		{"beginner", "advanced", "competitive"},
		{"unknown", "advanced", "beginner"},
	} {
		if SkillAllowed(tc.min, tc.max, tc.user) {
			t.Fatalf("skill accepted: %+v", tc)
		}
	}
}
