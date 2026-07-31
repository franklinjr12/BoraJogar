package matchmaking

import (
	"github.com/google/uuid"
	"testing"
)

func TestCompatibleRejectsBlocks(t *testing.T) {
	a, b := uuid.New(), uuid.New()
	pa := Player{ID: a, Active: true, OnboardingCompleted: true, ActiveForMatchmaking: true, BlockedUserIDs: map[uuid.UUID]bool{b: true}}
	pb := Player{ID: b, Active: true, OnboardingCompleted: true, ActiveForMatchmaking: true, BlockedUserIDs: map[uuid.UUID]bool{}}
	if Compatible(pa, pb) {
		t.Fatal("blocked players matched")
	}
}
