package availability

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	UnavailableAllDay   = "unavailable_all_day"
	UnavailableInterval = "unavailable_interval"
	AvailableInterval   = "available_interval"
)

type Rule struct {
	ID, UserID string
	Weekday    int
	Start, End string
	Timezone   string
	ValidFrom  time.Time
	ValidUntil *time.Time
	Active     bool
	VenueIDs   []string
	AreaIDs    []string
}

type Exception struct {
	ID, UserID                 string
	Date                       time.Time
	Type, Start, End, Timezone string
}

type Occurrence struct {
	StartsAt, EndsAt     time.Time
	SourceType, SourceID string
}

func ValidateRule(r Rule) error {
	if r.Weekday < 0 || r.Weekday > 6 {
		return errors.New("weekday must be between 0 and 6")
	}
	if strings.TrimSpace(r.Timezone) == "" {
		return errors.New("timezone is required")
	}
	if _, err := time.LoadLocation(r.Timezone); err != nil {
		return errors.New("timezone must be a valid IANA time zone")
	}
	start, end, err := parseTimes(r.Start, r.End)
	if err != nil {
		return err
	}
	if !end.After(start) {
		return errors.New("end time must be later than start time; cross-midnight rules are not supported")
	}
	if len(r.VenueIDs) == 0 && len(r.AreaIDs) == 0 {
		return errors.New("at least one venue or preferred area is required")
	}
	if r.ValidUntil != nil && r.ValidUntil.Before(r.ValidFrom) {
		return errors.New("valid until must not precede valid from")
	}
	return nil
}

func ValidateException(e Exception) error {
	if _, err := time.LoadLocation(e.Timezone); err != nil {
		return errors.New("timezone must be a valid IANA time zone")
	}
	if e.Type != UnavailableAllDay && e.Type != UnavailableInterval && e.Type != AvailableInterval {
		return errors.New("exception type is invalid")
	}
	if e.Type == UnavailableAllDay {
		if e.Start != "" || e.End != "" {
			return errors.New("all-day exception cannot include an interval")
		}
		return nil
	}
	start, end, err := parseTimes(e.Start, e.End)
	if err != nil {
		return err
	}
	if !end.After(start) {
		return errors.New("end time must be later than start time; cross-midnight exceptions are not supported")
	}
	return nil
}

func Expand(r Rule, exceptions []Exception, from, to time.Time) ([]Occurrence, error) {
	if err := ValidateRule(r); err != nil {
		return nil, err
	}
	if !to.After(from) {
		return []Occurrence{}, nil
	}
	loc, _ := time.LoadLocation(r.Timezone)
	startClock, _, _ := parseTimes(r.Start, r.End)
	_, endClock, _ := parseTimes(r.Start, r.End)
	result := []Occurrence{}
	for day := dateOnly(from); day.Before(to); day = day.AddDate(0, 0, 1) {
		if int(day.Weekday()) != r.Weekday || day.Before(dateOnly(r.ValidFrom)) || (r.ValidUntil != nil && day.After(dateOnly(*r.ValidUntil))) || !r.Active {
			continue
		}
		baseStart := time.Date(day.Year(), day.Month(), day.Day(), startClock.Hour(), startClock.Minute(), 0, 0, loc)
		baseEnd := time.Date(day.Year(), day.Month(), day.Day(), endClock.Hour(), endClock.Minute(), 0, 0, loc)
		parts := []Occurrence{{StartsAt: baseStart.UTC(), EndsAt: baseEnd.UTC(), SourceType: "rule", SourceID: r.ID}}
		for _, e := range exceptions {
			if dateOnly(e.Date).Equal(day) {
				var next []Occurrence
				for _, p := range parts {
					next = append(next, applyException(p, e, loc)...)
				}
				parts = next
			}
		}
		result = append(result, parts...)
	}
	return result, nil
}

func applyException(o Occurrence, e Exception, loc *time.Location) []Occurrence {
	if e.Type == UnavailableAllDay {
		return nil
	}
	s, end, _ := parseTimes(e.Start, e.End)
	es := time.Date(o.StartsAt.In(loc).Year(), o.StartsAt.In(loc).Month(), o.StartsAt.In(loc).Day(), s.Hour(), s.Minute(), 0, 0, loc).UTC()
	ee := time.Date(o.StartsAt.In(loc).Year(), o.StartsAt.In(loc).Month(), o.StartsAt.In(loc).Day(), end.Hour(), end.Minute(), 0, 0, loc).UTC()
	if e.Type == AvailableInterval {
		return []Occurrence{{StartsAt: es, EndsAt: ee, SourceType: "exception", SourceID: e.ID}}
	}
	if ee.Before(o.StartsAt) || !es.Before(o.EndsAt) {
		return []Occurrence{o}
	}
	result := []Occurrence{}
	if o.StartsAt.Before(es) {
		result = append(result, Occurrence{o.StartsAt, es, o.SourceType, o.SourceID})
	}
	if ee.Before(o.EndsAt) {
		result = append(result, Occurrence{ee, o.EndsAt, o.SourceType, o.SourceID})
	}
	return result
}

func ExpandAvailableException(e Exception) (Occurrence, error) {
	if e.Type != AvailableInterval {
		return Occurrence{}, errors.New("exception is not an available interval")
	}
	if err := ValidateException(e); err != nil {
		return Occurrence{}, err
	}
	loc, _ := time.LoadLocation(e.Timezone)
	start, end, _ := parseTimes(e.Start, e.End)
	date := dateOnly(e.Date)
	return Occurrence{StartsAt: time.Date(date.Year(), date.Month(), date.Day(), start.Hour(), start.Minute(), 0, 0, loc).UTC(), EndsAt: time.Date(date.Year(), date.Month(), date.Day(), end.Hour(), end.Minute(), 0, 0, loc).UTC(), SourceType: "exception", SourceID: e.ID}, nil
}

func parseTimes(start, end string) (time.Time, time.Time, error) {
	s, err := time.Parse("15:04", start)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("time must use HH:MM")
	}
	e, err := time.Parse("15:04", end)
	if err != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("time must use HH:MM")
	}
	return s, e, nil
}
func dateOnly(t time.Time) time.Time {
	y, m, d := t.Date()
	return time.Date(y, m, d, 0, 0, 0, 0, t.Location())
}
