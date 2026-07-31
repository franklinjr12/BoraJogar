package metrics

import (
	"sync/atomic"
	"time"
)

type Metrics struct {
	Requests      atomic.Uint64
	Errors        atomic.Uint64
	DurationNanos atomic.Uint64
}

type Snapshot struct {
	Requests uint64  `json:"httpRequestCount"`
	Errors   uint64  `json:"httpErrorCount"`
	Duration float64 `json:"httpDurationSeconds"`
}

func (m *Metrics) Observe(status int, duration time.Duration) {
	if m == nil {
		return
	}
	m.Requests.Add(1)
	if status >= 400 {
		m.Errors.Add(1)
	}
	m.DurationNanos.Add(uint64(duration))
}

func (m *Metrics) Snapshot() Snapshot {
	if m == nil {
		return Snapshot{}
	}
	return Snapshot{
		Requests: m.Requests.Load(),
		Errors:   m.Errors.Load(),
		Duration: float64(m.DurationNanos.Load()) / float64(time.Second),
	}
}
