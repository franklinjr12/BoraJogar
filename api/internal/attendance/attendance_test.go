package attendance

import (
	"testing"
	"time"
)

func TestClassifyCancellationStoresSixHourRule(t *testing.T) {
	start := time.Date(2026, 7, 31, 18, 0, 0, 0, time.UTC)
	if got := ClassifyCancellation(start.Add(-7*time.Hour), start, 6*time.Hour); got != Early {
		t.Fatalf("got %q", got)
	}
	if got := ClassifyCancellation(start.Add(-6*time.Hour+time.Minute), start, 6*time.Hour); got != Late {
		t.Fatalf("got %q", got)
	}
	if got := ClassifyCancellation(start.Add(time.Minute), start, 6*time.Hour); got != NoShowCancellation {
		t.Fatalf("got %q", got)
	}
}

func TestSummaryNeutralUntilFiveGames(t *testing.T) {
	if got := Summary(4, 4, 0, 0, 0); got.SufficientHistory || got.MatchmakingValue != 0 {
		t.Fatalf("new user not neutral: %+v", got)
	}
	if got := Summary(5, 4, 0, 1, 0); !got.SufficientHistory || got.MatchmakingValue != .8 {
		t.Fatalf("summary = %+v", got)
	}
}
