package availability

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Handler struct{ DB *pgxpool.Pool }
type ruleInput struct {
	Weekday                         int `json:"weekday"`
	Start, End, Timezone, ValidFrom string
	ValidUntil                      *string  `json:"validUntil"`
	Active                          *bool    `json:"active"`
	VenueIDs                        []string `json:"venueIds"`
	AreaIDs                         []string `json:"preferredAreaIds"`
}
type exceptionInput struct{ Date, Type, Start, End, Timezone string }
type ruleResponse struct {
	ID                              string `json:"id"`
	Weekday                         int    `json:"weekday"`
	Start, End, Timezone, ValidFrom string
	ValidUntil                      *string  `json:"validUntil,omitempty"`
	Active                          bool     `json:"active"`
	VenueIDs                        []string `json:"venueIds"`
	AreaIDs                         []string `json:"preferredAreaIds"`
}
type exceptionResponse struct{ ID, Date, Type, Start, End, Timezone string }
type calendarItem struct {
	StartsAt             time.Time `json:"startsAt"`
	EndsAt               time.Time `json:"endsAt"`
	SourceType, SourceID string
}

func (h Handler) Register(mux *http.ServeMux, requireAuth func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/me/availability/rules", requireAuth(http.HandlerFunc(h.rules)))
	mux.Handle("/api/v1/me/availability/rules/", requireAuth(http.HandlerFunc(h.rule)))
	mux.Handle("/api/v1/me/availability/exceptions", requireAuth(http.HandlerFunc(h.exceptions)))
	mux.Handle("/api/v1/me/availability/exceptions/", requireAuth(http.HandlerFunc(h.exception)))
	mux.Handle("/api/v1/me/availability/calendar", requireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		u, _ := auth.UserFromContext(r.Context())
		h.calendar(w, r, u.ID)
	})))
}

func (h Handler) rules(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		h.listRules(w, r, u.ID)
	case http.MethodPost:
		h.createRule(w, r, u.ID)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
func (h Handler) rule(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	id, err := uuid.Parse(strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/me/availability/rules/"), "/"))
	if err != nil {
		writeError(w, 404, "availability_rule_not_found", "Availability rule not found.")
		return
	}
	switch r.Method {
	case http.MethodPut:
		h.updateRule(w, r, u.ID, id)
	case http.MethodDelete:
		h.deleteOwned(w, r, u.ID, id)
	default:
		w.WriteHeader(405)
	}
}
func (h Handler) exceptions(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	switch r.Method {
	case http.MethodGet:
		h.listExceptions(w, r, u.ID)
	case http.MethodPost:
		h.createException(w, r, u.ID)
	default:
		w.WriteHeader(405)
	}
}
func (h Handler) exception(w http.ResponseWriter, r *http.Request) {
	u, _ := auth.UserFromContext(r.Context())
	id, err := uuid.Parse(strings.TrimSuffix(strings.TrimPrefix(r.URL.Path, "/api/v1/me/availability/exceptions/"), "/"))
	if err != nil {
		writeError(w, 404, "availability_exception_not_found", "Availability exception not found.")
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(405)
		return
	}
	h.deleteOwnedException(w, r, u.ID, id)
}

func decodeRule(r *http.Request) (Rule, error) {
	var in ruleInput
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		return Rule{}, errors.New("availability rule is invalid")
	}
	validFrom, err := time.Parse("2006-01-02", in.ValidFrom)
	if err != nil {
		return Rule{}, errors.New("validFrom must use YYYY-MM-DD")
	}
	var until *time.Time
	if in.ValidUntil != nil {
		v, e := time.Parse("2006-01-02", *in.ValidUntil)
		if e != nil {
			return Rule{}, errors.New("validUntil must use YYYY-MM-DD")
		}
		until = &v
	}
	active := true
	if in.Active != nil {
		active = *in.Active
	}
	rule := Rule{Weekday: in.Weekday, Start: in.Start, End: in.End, Timezone: in.Timezone, ValidFrom: validFrom, ValidUntil: until, Active: active, VenueIDs: in.VenueIDs, AreaIDs: in.AreaIDs}
	return rule, ValidateRule(rule)
}
func (h Handler) createRule(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	rule, err := decodeRule(r)
	if err != nil {
		writeError(w, 422, "invalid_availability_rule", err.Error())
		return
	}
	if rule.Active && h.overlaps(r, userID, rule, uuid.Nil) {
		writeError(w, http.StatusConflict, "availability_rule_conflict", "This interval overlaps an existing availability rule.")
		return
	}
	rule.ID = uuid.NewString()
	rule.UserID = userID.String()
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `INSERT INTO availability_rules(id,user_id,weekday,start_local_time,end_local_time,timezone,valid_from,valid_until,active) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, rule.ID, userID, rule.Weekday, rule.Start, rule.End, rule.Timezone, rule.ValidFrom, rule.ValidUntil, rule.Active); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if err = insertLocations(r, tx, rule, userID); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	_ = ExpandFuture(r.Context(), h.DB, time.Now().UTC())
	h.getRule(w, r, userID, uuid.MustParse(rule.ID))
}
func insertLocations(r *http.Request, tx pgx.Tx, rule Rule, userID uuid.UUID) error {
	for _, raw := range rule.VenueIDs {
		id, e := uuid.Parse(raw)
		if e != nil {
			return errors.New("invalid venue id")
		}
		if _, e = tx.Exec(r.Context(), `INSERT INTO availability_rule_venues(availability_rule_id,venue_id) SELECT $1,id FROM venues WHERE id=$2 AND active=true`, rule.ID, id); e != nil {
			return e
		}
	}
	for _, raw := range rule.AreaIDs {
		id, e := uuid.Parse(raw)
		if e != nil {
			return errors.New("invalid preferred area id")
		}
		if _, e = tx.Exec(r.Context(), `INSERT INTO availability_rule_areas(availability_rule_id,preferred_area_id) SELECT $1,id FROM preferred_areas WHERE id=$2 AND user_id=$3 AND active=true`, rule.ID, id, userID); e != nil {
			return e
		}
	}
	return nil
}
func (h Handler) listRules(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	rows, err := h.DB.Query(r.Context(), `SELECT id,weekday,to_char(start_local_time,'HH24:MI'),to_char(end_local_time,'HH24:MI'),timezone,valid_from,valid_until,active FROM availability_rules WHERE user_id=$1 ORDER BY weekday,start_local_time`, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer rows.Close()
	out := []ruleResponse{}
	for rows.Next() {
		var x ruleResponse
		var from time.Time
		var until *time.Time
		if err = rows.Scan(&x.ID, &x.Weekday, &x.Start, &x.End, &x.Timezone, &from, &until, &x.Active); err != nil {
			http.Error(w, "availability unavailable", 500)
			return
		}
		x.ValidFrom = from.Format("2006-01-02")
		if until != nil {
			v := until.Format("2006-01-02")
			x.ValidUntil = &v
		}
		x.VenueIDs, x.AreaIDs = h.locations(r.Context(), x.ID)
		out = append(out, x)
	}
	writeJSON(w, 200, out)
}
func (h Handler) getRule(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	var x ruleResponse
	var from time.Time
	var until *time.Time
	err := h.DB.QueryRow(r.Context(), `SELECT id,weekday,to_char(start_local_time,'HH24:MI'),to_char(end_local_time,'HH24:MI'),timezone,valid_from,valid_until,active FROM availability_rules WHERE id=$1 AND user_id=$2`, id, userID).Scan(&x.ID, &x.Weekday, &x.Start, &x.End, &x.Timezone, &from, &until, &x.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "availability_rule_not_found", "Availability rule not found.")
		return
	}
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	x.ValidFrom = from.Format("2006-01-02")
	if until != nil {
		v := until.Format("2006-01-02")
		x.ValidUntil = &v
	}
	x.VenueIDs, x.AreaIDs = h.locations(r.Context(), x.ID)
	writeJSON(w, 200, x)
}
func (h Handler) locations(ctx context.Context, id string) ([]string, []string) {
	venues := []string{}
	areas := []string{}
	rows, err := h.DB.Query(ctx, `SELECT venue_id::text,'' FROM availability_rule_venues WHERE availability_rule_id=$1 UNION ALL SELECT '',preferred_area_id::text FROM availability_rule_areas WHERE availability_rule_id=$1`, id)
	if err != nil {
		return venues, areas
	}
	defer rows.Close()
	for rows.Next() {
		var venue, area string
		if rows.Scan(&venue, &area) == nil {
			if venue != "" {
				venues = append(venues, venue)
			} else {
				areas = append(areas, area)
			}
		}
	}
	return venues, areas
}

func (h Handler) updateRule(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	rule, err := decodeRule(r)
	if err != nil {
		writeError(w, 422, "invalid_availability_rule", err.Error())
		return
	}
	if rule.Active && h.overlaps(r, userID, rule, id) {
		writeError(w, http.StatusConflict, "availability_rule_conflict", "This interval overlaps an existing availability rule.")
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	tag, err := tx.Exec(r.Context(), `UPDATE availability_rules SET weekday=$1,start_local_time=$2,end_local_time=$3,timezone=$4,valid_from=$5,valid_until=$6,active=$7,updated_at=now() WHERE id=$8 AND user_id=$9`, rule.Weekday, rule.Start, rule.End, rule.Timezone, rule.ValidFrom, rule.ValidUntil, rule.Active, id, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if tag.RowsAffected() != 1 {
		writeError(w, 404, "availability_rule_not_found", "Availability rule not found.")
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM availability_rule_venues WHERE availability_rule_id=$1`, id); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if _, err = tx.Exec(r.Context(), `DELETE FROM availability_rule_areas WHERE availability_rule_id=$1`, id); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	rule.ID = id.String()
	if err = insertLocations(r, tx, rule, userID); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	_ = ExpandFuture(r.Context(), h.DB, time.Now().UTC())
	h.getRule(w, r, userID, id)
}

func (h Handler) overlaps(r *http.Request, userID uuid.UUID, rule Rule, exclude uuid.UUID) bool {
	var count int
	err := h.DB.QueryRow(r.Context(), `SELECT count(*) FROM availability_rules WHERE user_id=$1 AND active=true AND weekday=$2 AND id<>$3 AND start_local_time < $6 AND end_local_time > $5 AND valid_from <= COALESCE($4, DATE '9999-12-31') AND COALESCE(valid_until, DATE '9999-12-31') >= $7`, userID, rule.Weekday, exclude, rule.ValidUntil, rule.Start, rule.End, rule.ValidFrom).Scan(&count)
	return err == nil && count > 0
}
func (h Handler) deleteOwned(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	tag, err := h.DB.Exec(r.Context(), `DELETE FROM availability_rules WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if tag.RowsAffected() != 1 {
		writeError(w, 404, "availability_rule_not_found", "Availability rule not found.")
		return
	}
	_ = ExpandFuture(r.Context(), h.DB, time.Now().UTC())
	w.WriteHeader(204)
}

func (h Handler) createException(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	var in exceptionInput
	if json.NewDecoder(r.Body).Decode(&in) != nil {
		writeError(w, 422, "invalid_availability_exception", "Exception is invalid.")
		return
	}
	date, err := time.Parse("2006-01-02", in.Date)
	if err != nil {
		writeError(w, 422, "invalid_availability_exception", "Date must use YYYY-MM-DD.")
		return
	}
	e := Exception{Date: date, Type: in.Type, Start: in.Start, End: in.End, Timezone: in.Timezone}
	if err = ValidateException(e); err != nil {
		writeError(w, 422, "invalid_availability_exception", err.Error())
		return
	}
	id := uuid.New()
	_, err = h.DB.Exec(r.Context(), `INSERT INTO availability_exceptions(id,user_id,exception_date,exception_type,start_local_time,end_local_time,timezone) VALUES($1,$2,$3,$4,$5,$6,$7)`, id, userID, date, in.Type, nullableTime(in.Start), nullableTime(in.End), in.Timezone)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	_ = ExpandFuture(r.Context(), h.DB, time.Now().UTC())
	writeJSON(w, 201, exceptionResponse{ID: id.String(), Date: in.Date, Type: in.Type, Start: in.Start, End: in.End, Timezone: in.Timezone})
}
func nullableTime(v string) *string {
	if v == "" {
		return nil
	}
	return &v
}
func (h Handler) listExceptions(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	rows, err := h.DB.Query(r.Context(), `SELECT id,exception_date,exception_type,COALESCE(to_char(start_local_time,'HH24:MI'),''),COALESCE(to_char(end_local_time,'HH24:MI'),''),timezone FROM availability_exceptions WHERE user_id=$1 ORDER BY exception_date`, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer rows.Close()
	out := []exceptionResponse{}
	for rows.Next() {
		var x exceptionResponse
		var d time.Time
		if err = rows.Scan(&x.ID, &d, &x.Type, &x.Start, &x.End, &x.Timezone); err != nil {
			http.Error(w, "availability unavailable", 500)
			return
		}
		x.Date = d.Format("2006-01-02")
		out = append(out, x)
	}
	writeJSON(w, 200, out)
}
func (h Handler) deleteOwnedException(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	tag, err := h.DB.Exec(r.Context(), `DELETE FROM availability_exceptions WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	if tag.RowsAffected() != 1 {
		writeError(w, 404, "availability_exception_not_found", "Availability exception not found.")
		return
	}
	_ = ExpandFuture(r.Context(), h.DB, time.Now().UTC())
	w.WriteHeader(204)
}

func (h Handler) calendar(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	from, err := time.Parse("2006-01-02", r.URL.Query().Get("from"))
	if err != nil {
		from = time.Now().UTC()
	}
	to, err := time.Parse("2006-01-02", r.URL.Query().Get("to"))
	if err != nil || !to.After(from) || to.Sub(from) > 24*21 {
		writeError(w, 422, "invalid_calendar_range", "Calendar range must be 1 to 21 days.")
		return
	}
	rows, err := h.DB.Query(r.Context(), `SELECT id,weekday,to_char(start_local_time,'HH24:MI'),to_char(end_local_time,'HH24:MI'),timezone,valid_from,valid_until,active FROM availability_rules WHERE user_id=$1`, userID)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer rows.Close()
	rules := []Rule{}
	for rows.Next() {
		var x Rule
		var fromDate time.Time
		var until *time.Time
		if err = rows.Scan(&x.ID, &x.Weekday, &x.Start, &x.End, &x.Timezone, &fromDate, &until, &x.Active); err != nil {
			http.Error(w, "availability unavailable", 500)
			return
		}
		x.ValidFrom = fromDate
		x.ValidUntil = until
		rules = append(rules, x)
	}
	exceptions := []Exception{}
	exRows, err := h.DB.Query(r.Context(), `SELECT id,exception_date,exception_type,COALESCE(to_char(start_local_time,'HH24:MI'),''),COALESCE(to_char(end_local_time,'HH24:MI'),''),timezone FROM availability_exceptions WHERE user_id=$1 AND exception_date >= $2 AND exception_date < $3`, userID, from, to)
	if err != nil {
		http.Error(w, "availability unavailable", 500)
		return
	}
	defer exRows.Close()
	for exRows.Next() {
		var x Exception
		if err = exRows.Scan(&x.ID, &x.Date, &x.Type, &x.Start, &x.End, &x.Timezone); err != nil {
			http.Error(w, "availability unavailable", 500)
			return
		}
		exceptions = append(exceptions, x)
	}
	out := []calendarItem{}
	seenExceptions := map[string]bool{}
	for _, rule := range rules {
		items, ex := Expand(rule, exceptions, from, to)
		if ex != nil {
			http.Error(w, "availability unavailable", 500)
			return
		}
		for _, item := range items {
			out = append(out, calendarItem{item.StartsAt, item.EndsAt, item.SourceType, item.SourceID})
			if item.SourceType == "exception" {
				seenExceptions[item.SourceID] = true
			}
		}
	}
	for _, exception := range exceptions {
		if exception.Type == AvailableInterval && !seenExceptions[exception.ID] {
			item, expandErr := ExpandAvailableException(exception)
			if expandErr != nil {
				http.Error(w, "availability unavailable", 500)
				return
			}
			out = append(out, calendarItem{item.StartsAt, item.EndsAt, item.SourceType, item.SourceID})
		}
	}
	writeJSON(w, 200, out)
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]interface{}{"error": map[string]interface{}{"code": code, "message": message, "fields": map[string]string{}}})
}
