package attendance

import "time"

const LateCancellationThreshold = 6 * time.Hour

type Status string

const (
	Unknown  Status = "unknown"
	Attended Status = "attended"
	NoShow   Status = "no_show"
)

type CancellationType string

const (
	Early              CancellationType = "early"
	Late               CancellationType = "late"
	NoShowCancellation CancellationType = "no_show"
)

func ClassifyCancellation(cancelledAt, startsAt time.Time, threshold time.Duration) CancellationType {
	if threshold <= 0 {
		threshold = LateCancellationThreshold
	}
	if !cancelledAt.Before(startsAt) {
		return NoShowCancellation
	}
	if startsAt.Sub(cancelledAt) < threshold {
		return Late
	}
	return Early
}

type Reliability struct {
	GamesConfirmed, GamesAttended, EarlyCancellations, LateCancellations, NoShows int
	SufficientHistory                                                             bool
	MatchmakingValue                                                              float64
}

func Summary(gamesConfirmed, gamesAttended, early, late, noShows int) Reliability {
	r := Reliability{GamesConfirmed: gamesConfirmed, GamesAttended: gamesAttended, EarlyCancellations: early, LateCancellations: late, NoShows: noShows}
	r.SufficientHistory = gamesConfirmed >= 5
	if r.SufficientHistory && gamesConfirmed > 0 {
		r.MatchmakingValue = float64(gamesAttended) / float64(gamesConfirmed)
	}
	return r
}
