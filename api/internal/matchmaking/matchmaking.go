package matchmaking

import (
	"sort"
	"time"

	"github.com/google/uuid"
)

type Config struct {
	LookaheadDays, DurationMinutes, PlayerCount, SlotIncrementMinutes int
	MaxSkillDifference, MinimumNoticeMinutes                          int
}

type Occurrence struct {
	UserID           uuid.UUID
	StartsAt, EndsAt time.Time
}

type Player struct {
	ID                   uuid.UUID
	Active               bool
	OnboardingCompleted  bool
	ActiveForMatchmaking bool
	SkillRank            int
	BlockedUserIDs       map[uuid.UUID]bool
}

// Compatible rejects hard safety filters before scoring.
func Compatible(a, b Player) bool {
	if !a.Active || !b.Active || !a.OnboardingCompleted || !b.OnboardingCompleted || !a.ActiveForMatchmaking || !b.ActiveForMatchmaking {
		return false
	}
	return !a.BlockedUserIDs[b.ID] && !b.BlockedUserIDs[a.ID]
}

type CandidateSlot struct {
	StartsAt, EndsAt time.Time
	UserIDs          []uuid.UUID
}

// GenerateCandidateSlots produces stable slots; input order never affects output.
func GenerateCandidateSlots(occurrences []Occurrence, players map[uuid.UUID]Player, now time.Time, cfg Config) []CandidateSlot {
	if cfg.LookaheadDays < 1 || cfg.DurationMinutes < 1 || cfg.PlayerCount < 1 || cfg.SlotIncrementMinutes < 1 {
		return nil
	}
	from := now.UTC().Add(time.Duration(cfg.MinimumNoticeMinutes) * time.Minute)
	to := now.UTC().AddDate(0, 0, cfg.LookaheadDays)
	starts := map[time.Time]map[uuid.UUID]bool{}
	for _, occurrence := range occurrences {
		player, ok := players[occurrence.UserID]
		if !ok || !player.Active || !player.OnboardingCompleted || !player.ActiveForMatchmaking {
			continue
		}
		start := occurrence.StartsAt.UTC().Truncate(time.Minute)
		dayStart := time.Date(start.Year(), start.Month(), start.Day(), 0, 0, 0, 0, time.UTC)
		minuteOfDay := int(start.Sub(dayStart) / time.Minute)
		offset := (cfg.SlotIncrementMinutes - minuteOfDay%cfg.SlotIncrementMinutes) % cfg.SlotIncrementMinutes
		start = start.Add(time.Duration(offset) * time.Minute)
		if start.Before(from) {
			fromMinute := int(from.Sub(dayStart) / time.Minute)
			fromOffset := (cfg.SlotIncrementMinutes - fromMinute%cfg.SlotIncrementMinutes) % cfg.SlotIncrementMinutes
			start = from.Truncate(time.Minute).Add(time.Duration(fromOffset) * time.Minute)
		}
		for candidate := start; candidate.Before(to); candidate = candidate.Add(time.Duration(cfg.SlotIncrementMinutes) * time.Minute) {
			end := candidate.Add(time.Duration(cfg.DurationMinutes) * time.Minute)
			if !candidate.Before(occurrence.StartsAt) && !end.After(occurrence.EndsAt) {
				if starts[candidate] == nil {
					starts[candidate] = map[uuid.UUID]bool{}
				}
				compatible := true
				for existing := range starts[candidate] {
					if !Compatible(player, players[existing]) {
						compatible = false
						break
					}
				}
				if !compatible {
					continue
				}
				starts[candidate][occurrence.UserID] = true
			}
		}
	}
	result := make([]CandidateSlot, 0, len(starts))
	for start, users := range starts {
		ids := make([]uuid.UUID, 0, len(users))
		for id := range users {
			ids = append(ids, id)
		}
		sort.Slice(ids, func(i, j int) bool { return ids[i].String() < ids[j].String() })
		if len(ids) >= cfg.PlayerCount {
			result = append(result, CandidateSlot{StartsAt: start, EndsAt: start.Add(time.Duration(cfg.DurationMinutes) * time.Minute), UserIDs: ids})
		}
	}
	sort.Slice(result, func(i, j int) bool { return result[i].StartsAt.Before(result[j].StartsAt) })
	return result
}

type ScoreInput struct {
	TimeOverlapMinutes, DistanceScore, SkillBalanceScore, StyleCompatibilityScore      int
	VenuePreferenceScore, PositiveHistoryScore, ReliabilityScore, RecentPairingPenalty int
	IsNewUser                                                                          bool
}

type Score struct {
	Total                                                                    float64
	TimeOverlap, VenuePreference, Distance, SkillBalance, StyleCompatibility float64
	PositiveHistory, Reliability, RecentPairingPenalty                       float64
}

func ScoreCandidate(in ScoreInput) Score {
	reliability := float64(in.ReliabilityScore)
	if in.IsNewUser {
		reliability = 0
	}
	s := Score{TimeOverlap: float64(in.TimeOverlapMinutes), VenuePreference: float64(in.VenuePreferenceScore), Distance: float64(in.DistanceScore), SkillBalance: float64(in.SkillBalanceScore), StyleCompatibility: float64(in.StyleCompatibilityScore), PositiveHistory: float64(in.PositiveHistoryScore), Reliability: reliability * 0.1, RecentPairingPenalty: float64(in.RecentPairingPenalty)}
	s.Total = s.TimeOverlap + s.VenuePreference + s.Distance + s.SkillBalance + s.StyleCompatibility + s.PositiveHistory + s.Reliability - s.RecentPairingPenalty
	return s
}
