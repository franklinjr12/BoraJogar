package metrics

import (
	"testing"
	"time"
)

func TestObserveTracksRequestsErrorsAndDuration(t *testing.T) {
	m := &Metrics{}
	m.Observe(200, 150*time.Millisecond)
	m.Observe(500, 50*time.Millisecond)
	got := m.Snapshot()
	if got.Requests != 2 || got.Errors != 1 || got.Duration != 0.2 {
		t.Fatalf("snapshot = %+v", got)
	}
}
