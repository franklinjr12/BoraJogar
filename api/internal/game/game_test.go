package game

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
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

func TestValidateCreateWaitlistConfiguration(t *testing.T) {
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	base := CreateInput{
		StartsAt:          "2026-07-31T12:00:00Z",
		DurationMinutes:   90,
		VenueID:           "venue",
		Capacity:          4,
		MinimumSkillLevel: "beginner",
		MaximumSkillLevel: "advanced",
		Visibility:        "public",
	}
	if _, _, err := ValidateCreate(base, now); err != nil {
		t.Fatalf("disabled waitlist default rejected: %v", err)
	}
	for _, size := range []int{0, 13} {
		input := base
		input.WaitlistEnabled = true
		input.WaitlistSize = size
		if _, _, err := ValidateCreate(input, now); err == nil {
			t.Fatalf("waitlist size %d accepted", size)
		}
	}
	input := base
	input.WaitlistSize = 1
	if _, _, err := ValidateCreate(input, now); err == nil {
		t.Fatal("disabled waitlist with positive size accepted")
	}
	for _, size := range []int{1, 12} {
		input := base
		input.WaitlistEnabled = true
		input.WaitlistSize = size
		if _, _, err := ValidateCreate(input, now); err != nil {
			t.Fatalf("waitlist size %d rejected: %v", size, err)
		}
	}
}

func TestValidateCreateConfirmationDefaultsOffAndAcceptsOptIn(t *testing.T) {
	now := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	base := CreateInput{
		StartsAt:          now.Add(48 * time.Hour).Format(time.RFC3339),
		DurationMinutes:   90,
		VenueID:           "venue",
		Capacity:          4,
		MinimumSkillLevel: "beginner",
		MaximumSkillLevel: "advanced",
		Visibility:        "public",
	}
	if base.ConfirmationEnabled {
		t.Fatal("confirmation must default to disabled")
	}
	if _, _, err := ValidateCreate(base, now); err != nil {
		t.Fatalf("default-disabled confirmation rejected: %v", err)
	}
	base.ConfirmationEnabled = true
	if _, _, err := ValidateCreate(base, now); err != nil {
		t.Fatalf("confirmation opt-in rejected: %v", err)
	}
}

func TestConfirmationWindowBoundaries(t *testing.T) {
	starts := time.Date(2026, 8, 1, 15, 0, 0, 0, time.UTC)
	ends := starts.Add(90 * time.Minute)
	for _, test := range []struct {
		name string
		now  time.Time
		open bool
	}{
		{"disabled", starts.Add(-24 * time.Hour), false},
		{"cancelled", starts.Add(-24 * time.Hour), false},
		{"completed", starts.Add(-24 * time.Hour), false},
		{"25 hours before", starts.Add(-25 * time.Hour), false},
		{"exactly 24 hours before", starts.Add(-24 * time.Hour), true},
		{"at start", starts, true},
		{"at end", ends, true},
		{"after end", ends.Add(time.Nanosecond), false},
	} {
		status := "scheduled"
		enabled := true
		if test.name == "disabled" {
			enabled = false
		}
		if test.name == "cancelled" {
			status = "cancelled"
		}
		if test.name == "completed" {
			status = "completed"
		}
		if got := ConfirmationWindowOpen(enabled, status, starts, ends, test.now); got != test.open {
			t.Errorf("%s: got %v, want %v", test.name, got, test.open)
		}
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

func TestValidatePlayerRemovalRequiresOrganizerAndConfirmedPlayer(t *testing.T) {
	if err := ValidatePlayerRemoval("player", "player", "confirmed"); !errors.Is(err, ErrForbidden) {
		t.Fatalf("non-organizer removal error = %v", err)
	}
	if err := ValidatePlayerRemoval("organizer", "organizer", "confirmed"); !errors.Is(err, ErrConflict) {
		t.Fatalf("organizer removal error = %v", err)
	}
	if err := ValidatePlayerRemoval("organizer", "player", "removed"); !errors.Is(err, ErrConflict) {
		t.Fatalf("removed player error = %v", err)
	}
	if err := ValidatePlayerRemoval("organizer", "player", "confirmed"); err != nil {
		t.Fatalf("confirmed player removal error = %v", err)
	}
}

type recordingPublisher struct {
	events []notification.EventInput
}

func (p *recordingPublisher) Publish(_ context.Context, input notification.EventInput) error {
	p.events = append(p.events, input)
	return nil
}

func TestNotifyGameUsersPublishesRemovalEventWithSafeActionData(t *testing.T) {
	publisher := &recordingPublisher{}
	gameID := uuid.New()
	playerID := uuid.New()
	h := Handler{Notifications: publisher}

	h.notifyGameUsers(context.Background(), []uuid.UUID{playerID}, notification.GameChanged, "Removed", "Removed from game", gameID, playerID)

	if len(publisher.events) != 1 {
		t.Fatalf("events = %d, want 1", len(publisher.events))
	}
	event := publisher.events[0]
	if event.UserID != playerID || event.Type != notification.GameChanged || event.ActionURL != "/games/"+gameID.String() {
		t.Fatalf("event = %+v", event)
	}
	if payload, ok := event.Payload.(map[string]string); !ok || payload["gameId"] != gameID.String() || payload["playerId"] != playerID.String() {
		t.Fatalf("payload = %#v", event.Payload)
	}
}

func TestNotifyWaitlistOpenNotifiesEveryWaitingUser(t *testing.T) {
	publisher := &recordingPublisher{}
	gameID := uuid.New()
	recipients := []uuid.UUID{uuid.New(), uuid.New()}
	Handler{Notifications: publisher}.notifyWaitlistOpen(context.Background(), recipients, gameID)

	if len(publisher.events) != len(recipients) {
		t.Fatalf("events = %d, want %d", len(publisher.events), len(recipients))
	}
	for index, event := range publisher.events {
		if event.UserID != recipients[index] || event.Type != notification.WaitlistOpen || event.ActionURL != "/games/"+gameID.String() {
			t.Fatalf("event[%d] = %+v", index, event)
		}
		payload, ok := event.Payload.(map[string]string)
		if !ok || payload["gameId"] != gameID.String() || len(payload) != 1 {
			t.Fatalf("payload[%d] = %#v", index, event.Payload)
		}
	}
}

func TestNotifyGameCancellationPublishesTypedMatchDetails(t *testing.T) {
	publisher := &recordingPublisher{}
	title := "Saturday game"
	address := "Beach entrance"
	reason := "Weather"
	payload := notification.GameCancellationPayload{
		GameID:       "game-1",
		Title:        &title,
		StartsAt:     time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC),
		EndsAt:       time.Date(2026, 8, 2, 13, 30, 0, 0, time.UTC),
		VenueName:    "Central court",
		AddressLabel: &address,
		Reason:       &reason,
	}
	recipient := uuid.New()
	Handler{Notifications: publisher}.notifyGameCancellation(context.Background(), []uuid.UUID{recipient}, payload)

	if len(publisher.events) != 1 {
		t.Fatalf("events = %d, want 1", len(publisher.events))
	}
	event := publisher.events[0]
	if event.UserID != recipient || event.Type != notification.GameCancelled || event.ActionURL != "/games/game-1" {
		t.Fatalf("event = %+v", event)
	}
	got, ok := event.Payload.(notification.GameCancellationPayload)
	if !ok || got.VenueName != payload.VenueName || got.StartsAt != payload.StartsAt || got.Reason == nil || *got.Reason != *payload.Reason {
		t.Fatalf("payload = %#v", event.Payload)
	}
}
