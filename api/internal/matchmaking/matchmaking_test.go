package matchmaking

import (
	"sort"
	"testing"
	"time"

	"github.com/google/uuid"
)

func TestGenerateCandidateSlotsDeterministicAndFiltersPlayers(t *testing.T) {
	now := time.Date(2026, 7, 30, 8, 0, 0, 0, time.UTC)
	a, b, inactive := uuid.New(), uuid.New(), uuid.New()
	players := map[uuid.UUID]Player{a: {ID: a, Active: true, OnboardingCompleted: true, ActiveForMatchmaking: true}, b: {ID: b, Active: true, OnboardingCompleted: true, ActiveForMatchmaking: true}, inactive: {ID: inactive, Active: false, OnboardingCompleted: true, ActiveForMatchmaking: true}}
	occurrences := []Occurrence{{UserID: b, StartsAt: now.Add(13 * time.Hour), EndsAt: now.Add(16 * time.Hour)}, {UserID: inactive, StartsAt: now.Add(13 * time.Hour), EndsAt: now.Add(16 * time.Hour)}, {UserID: a, StartsAt: now.Add(13 * time.Hour), EndsAt: now.Add(16 * time.Hour)}}
	got := GenerateCandidateSlots(occurrences, players, now, Config{LookaheadDays: 2, DurationMinutes: 90, PlayerCount: 2, SlotIncrementMinutes: 30, MinimumNoticeMinutes: 720})
	if len(got) != 4 {
		t.Fatalf("slots = %d, want 4", len(got))
	}
	want := []uuid.UUID{a, b}
	sort.Slice(want, func(i, j int) bool { return want[i].String() < want[j].String() })
	if len(got[0].UserIDs) != 2 || got[0].UserIDs[0] != want[0] || got[0].UserIDs[1] != want[1] {
		t.Fatalf("users = %v", got[0].UserIDs)
	}
}

func TestScoreCandidateNewUserNeutralReliability(t *testing.T) {
	s := ScoreCandidate(ScoreInput{TimeOverlapMinutes: 90, ReliabilityScore: 100, IsNewUser: true})
	if s.Reliability != 0 || s.Total != 90 {
		t.Fatalf("score = %+v", s)
	}
}
