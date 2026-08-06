package game

import (
	"errors"
	"strings"
	"time"
)

var (
	ErrInvalidGame = errors.New("invalid game")
	ErrForbidden   = errors.New("game action forbidden")
	ErrNotFound    = errors.New("game not found")
	ErrConflict    = errors.New("game state conflict")
)

var skillRank = map[string]int{"learning": 0, "beginner": 1, "intermediate": 2, "advanced": 3, "competitive": 4}

type CreateInput struct {
	StartsAt          string  `json:"startsAt"`
	EndsAt            string  `json:"endsAt"`
	DurationMinutes   int     `json:"durationMinutes"`
	VenueID           string  `json:"venueId"`
	Capacity          int     `json:"capacity"`
	MinimumSkillLevel string  `json:"minimumSkillLevel"`
	MaximumSkillLevel string  `json:"maximumSkillLevel"`
	Visibility        string  `json:"visibility"`
	Title             *string `json:"title"`
	Description       *string `json:"description"`
}

func ValidateCreate(in CreateInput, now time.Time) (time.Time, time.Time, error) {
	starts, err := time.Parse(time.RFC3339, in.StartsAt)
	if err != nil {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("startsAt must use RFC3339"))
	}
	if !starts.After(now) {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("startsAt must be in the future"))
	}
	ends := time.Time{}
	if in.EndsAt != "" {
		ends, err = time.Parse(time.RFC3339, in.EndsAt)
	} else if in.DurationMinutes > 0 {
		ends = starts.Add(time.Duration(in.DurationMinutes) * time.Minute)
	} else {
		err = ErrInvalidGame
	}
	if err != nil || !ends.After(starts) {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("end must be after start"))
	}
	if in.Capacity < 2 || in.Capacity > 12 {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("capacity must be between 2 and 12"))
	}
	if _, ok := skillRank[in.MinimumSkillLevel]; !ok {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("minimum skill is invalid"))
	}
	if _, ok := skillRank[in.MaximumSkillLevel]; !ok || skillRank[in.MaximumSkillLevel] < skillRank[in.MinimumSkillLevel] {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("maximum skill must not be below minimum skill"))
	}
	if in.Visibility != "public" && in.Visibility != "link-only" && in.Visibility != "private" {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("visibility is invalid"))
	}
	if strings.TrimSpace(in.VenueID) == "" {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("venueId is required"))
	}
	if in.Title != nil && len([]rune(strings.TrimSpace(*in.Title))) > 120 {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("title is too long"))
	}
	if in.Description != nil && len([]rune(*in.Description)) > 2000 {
		return time.Time{}, time.Time{}, errors.Join(ErrInvalidGame, errors.New("description is too long"))
	}
	return starts.UTC(), ends.UTC(), nil
}

func SkillAllowed(minimum, maximum, userSkill string) bool {
	min, minOK := skillRank[minimum]
	max, maxOK := skillRank[maximum]
	level, levelOK := skillRank[userSkill]
	return minOK && maxOK && levelOK && level >= min && level <= max
}

func ValidatePlayerRemoval(actorRole, targetRole, targetStatus string) error {
	if actorRole != "organizer" {
		return ErrForbidden
	}
	if targetRole == "organizer" || targetStatus != "confirmed" {
		return ErrConflict
	}
	return nil
}
