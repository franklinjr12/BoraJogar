package game

import (
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
	_, _, err = ValidateCreate(CreateInput{StartsAt: "2026-07-31T12:00:00Z", DurationMinutes: 90, VenueID: "venue", Capacity: 4, MinimumSkillLevel: "beginner", MaximumSkillLevel: "advanced", Visibility: "secret"}, now)
	if err == nil {
		t.Fatal("invalid visibility accepted")
	}
}
