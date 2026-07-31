package location

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/platform/audit"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

const maxActiveAreas = 5

var (
	validLighting = map[string]bool{"unknown": true, "no_lighting": true, "has_lighting": true}
	validSurface  = map[string]bool{"unknown": true, "sand": true, "grass": true, "hard_court": true, "other": true}
	validAccess   = map[string]bool{"unknown": true, "public": true, "private": true, "paid_entry": true}
)

type Handler struct{ DB *pgxpool.Pool }

type venue struct {
	ID             string   `json:"id"`
	Name           string   `json:"name"`
	City           string   `json:"city"`
	Description    *string  `json:"description,omitempty"`
	AddressLabel   *string  `json:"addressLabel,omitempty"`
	Latitude       float64  `json:"latitude"`
	Longitude      float64  `json:"longitude"`
	LightingStatus string   `json:"lightingStatus"`
	SurfaceType    string   `json:"surfaceType"`
	AccessType     string   `json:"accessType"`
	Active         bool     `json:"active"`
	DistanceMeters *float64 `json:"distanceMeters,omitempty"`
}

type areaInput struct {
	Label        string  `json:"label"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	RadiusMeters int     `json:"radiusMeters"`
	Priority     int     `json:"priority"`
}

type area struct {
	ID           string  `json:"id"`
	Label        string  `json:"label"`
	Latitude     float64 `json:"latitude"`
	Longitude    float64 `json:"longitude"`
	RadiusMeters int     `json:"radiusMeters"`
	Priority     int     `json:"priority"`
	Active       bool    `json:"active"`
}

type venueSuggestion struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Description  *string   `json:"description,omitempty"`
	AddressLabel *string   `json:"addressLabel,omitempty"`
	City         string    `json:"city"`
	Latitude     float64   `json:"latitude"`
	Longitude    float64   `json:"longitude"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (h Handler) Register(mux *http.ServeMux, requireAuth, requireAdmin func(http.Handler) http.Handler) {
	mux.Handle("/api/v1/venues", requireAuth(http.HandlerFunc(h.venues)))
	mux.Handle("/api/v1/venues/", requireAuth(http.HandlerFunc(h.venueByID)))
	mux.Handle("/api/v1/me/venues", requireAuth(http.HandlerFunc(h.ownedVenues)))
	mux.Handle("/api/v1/me/preferred-areas", requireAuth(http.HandlerFunc(h.preferredAreas)))
	mux.Handle("/api/v1/me/preferred-areas/", requireAuth(http.HandlerFunc(h.preferredAreaByID)))
	mux.Handle("/api/v1/me/favorite-venues", requireAuth(http.HandlerFunc(h.favoriteVenues)))
	mux.Handle("/api/v1/me/favorite-venues/", requireAuth(http.HandlerFunc(h.favoriteVenueByID)))
	mux.Handle("/api/v1/admin/venues/suggestions", requireAdmin(http.HandlerFunc(h.adminSuggestions)))
	mux.Handle("/api/v1/admin/venues/suggestions/", requireAdmin(http.HandlerFunc(h.adminSuggestionAction)))
}

func currentUser(r *http.Request) (auth.User, bool) { return auth.UserFromContext(r.Context()) }

func validPoint(latitude, longitude float64) bool {
	return latitude >= -90 && latitude <= 90 && longitude >= -180 && longitude <= 180
}
func pointArgs(latitude, longitude float64) (string, string) {
	return strconv.FormatFloat(longitude, 'f', 7, 64), strconv.FormatFloat(latitude, 'f', 7, 64)
}
func visibleVenueWhere() string {
	return `v.active=true AND (v.approved_at IS NOT NULL OR v.created_by_user_id=$1) AND ($2='' OR lower(v.city)=lower($2))`
}

func (h Handler) venues(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	city := strings.TrimSpace(r.URL.Query().Get("city"))
	lat, latErr := strconv.ParseFloat(r.URL.Query().Get("latitude"), 64)
	lon, lonErr := strconv.ParseFloat(r.URL.Query().Get("longitude"), 64)
	hasPoint := r.URL.Query().Get("latitude") != "" || r.URL.Query().Get("longitude") != ""
	if hasPoint && (latErr != nil || lonErr != nil || !validPoint(lat, lon)) {
		writeError(w, 422, "invalid_location", "Map coordinates are invalid.")
		return
	}
	query := `SELECT v.id,v.name,v.description,v.address_label,v.city,ST_Y(v.location::geometry),ST_X(v.location::geometry),v.lighting_status,v.surface_type,v.access_type,v.active` +
		` FROM venues v WHERE ` + visibleVenueWhere() + ` ORDER BY EXISTS (SELECT 1 FROM user_favorite_venues f WHERE f.user_id=$1 AND f.venue_id=v.id) DESC, v.name`
	args := []any{mustUserID(r), city}
	if hasPoint {
		lonText, latText := pointArgs(lat, lon)
		query = `SELECT v.id,v.name,v.description,v.address_label,v.city,ST_Y(v.location::geometry),ST_X(v.location::geometry),v.lighting_status,v.surface_type,v.access_type,v.active,ST_Distance(v.location,ST_SetSRID(ST_MakePoint($3,$4),4326)::geography) AS distance_meters` +
			` FROM venues v WHERE ` + visibleVenueWhere() + ` ORDER BY EXISTS (SELECT 1 FROM user_favorite_venues f WHERE f.user_id=$1 AND f.venue_id=v.id) DESC, distance_meters, v.name`
		args = []any{mustUserID(r), city, lonText, latText}
	}
	rows, err := h.DB.Query(r.Context(), query, args...)
	if err != nil {
		http.Error(w, "venues unavailable", 500)
		return
	}
	defer rows.Close()
	items := []venue{}
	for rows.Next() {
		var v venue
		var distance *float64
		values := []any{&v.ID, &v.Name, &v.Description, &v.AddressLabel, &v.City, &v.Latitude, &v.Longitude, &v.LightingStatus, &v.SurfaceType, &v.AccessType, &v.Active}
		if hasPoint {
			values = append(values, &distance)
		}
		if err := rows.Scan(values...); err != nil {
			http.Error(w, "venues unavailable", 500)
			return
		}
		v.DistanceMeters = distance
		items = append(items, v)
	}
	writeJSON(w, http.StatusOK, items)
}

func (h Handler) ownedVenues(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	u, _ := currentUser(r)
	var in struct {
		Name           string  `json:"name"`
		Description    *string `json:"description"`
		AddressLabel   *string `json:"addressLabel"`
		City           string  `json:"city"`
		Latitude       float64 `json:"latitude"`
		Longitude      float64 `json:"longitude"`
		LightingStatus string  `json:"lightingStatus"`
		SurfaceType    string  `json:"surfaceType"`
		AccessType     string  `json:"accessType"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.Name) == "" || len(strings.TrimSpace(in.Name)) < 2 || len(strings.TrimSpace(in.Name)) > 160 || strings.TrimSpace(in.City) == "" || len(strings.TrimSpace(in.City)) > 120 || !validPoint(in.Latitude, in.Longitude) {
		writeError(w, 422, "invalid_venue", "Venue name, city, and map pin are required.")
		return
	}
	if in.LightingStatus == "" {
		in.LightingStatus = "unknown"
	}
	if in.SurfaceType == "" {
		in.SurfaceType = "sand"
	}
	if in.AccessType == "" {
		in.AccessType = "unknown"
	}
	if !validLighting[in.LightingStatus] || !validSurface[in.SurfaceType] || !validAccess[in.AccessType] {
		writeError(w, 422, "invalid_venue", "Venue details are invalid.")
		return
	}
	lon, lat := pointArgs(in.Latitude, in.Longitude)
	id := uuid.New()
	var out venue
	err := h.DB.QueryRow(
		r.Context(),
		`INSERT INTO venues(id,name,description,address_label,city,location,lighting_status,surface_type,access_type,active,created_by_user_id) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8,$9,$10,true,$11) RETURNING id,name,description,address_label,city,ST_Y(location::geometry),ST_X(location::geometry),lighting_status,surface_type,access_type,active`,
		id, strings.TrimSpace(in.Name), in.Description, in.AddressLabel, strings.TrimSpace(in.City), lon, lat, in.LightingStatus, in.SurfaceType, in.AccessType, u.ID,
	).Scan(&out.ID, &out.Name, &out.Description, &out.AddressLabel, &out.City, &out.Latitude, &out.Longitude, &out.LightingStatus, &out.SurfaceType, &out.AccessType, &out.Active)
	if err != nil {
		http.Error(w, "venues unavailable", 500)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (h Handler) venueByID(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(r.URL.Path, "/suggestions") {
		h.suggestVenue(w, r)
		return
	}
	if strings.HasSuffix(r.URL.Path, "/favorite") {
		h.addFavorite(w, r, mustUserID(r))
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	id, err := uuid.Parse(strings.TrimPrefix(r.URL.Path, "/api/v1/venues/"))
	if err != nil {
		writeError(w, 404, "venue_not_found", "Venue not found.")
		return
	}
	var v venue
	err = h.DB.QueryRow(r.Context(), `SELECT id,name,description,address_label,city,ST_Y(location::geometry),ST_X(location::geometry),lighting_status,surface_type,access_type,active FROM venues WHERE id=$1 AND active=true AND (approved_at IS NOT NULL OR created_by_user_id=$2)`, id, mustUserID(r)).Scan(&v.ID, &v.Name, &v.Description, &v.AddressLabel, &v.City, &v.Latitude, &v.Longitude, &v.LightingStatus, &v.SurfaceType, &v.AccessType, &v.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "venue_not_found", "Venue not found.")
		return
	}
	if err != nil {
		http.Error(w, "venue unavailable", 500)
		return
	}
	writeJSON(w, 200, v)
}

func mustUserID(r *http.Request) uuid.UUID { u, _ := currentUser(r); return u.ID }

func (h Handler) suggestVenue(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	u, _ := currentUser(r)
	var in struct {
		Name         string  `json:"name"`
		Description  *string `json:"description"`
		AddressLabel *string `json:"addressLabel"`
		City         string  `json:"city"`
		Latitude     float64 `json:"latitude"`
		Longitude    float64 `json:"longitude"`
	}
	if json.NewDecoder(r.Body).Decode(&in) != nil || strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.City) == "" || !validPoint(in.Latitude, in.Longitude) {
		writeError(w, 422, "invalid_venue_suggestion", "Venue name and map pin are required.")
		return
	}
	lon, lat := pointArgs(in.Latitude, in.Longitude)
	id := uuid.New()
	_, err := h.DB.Exec(r.Context(), `INSERT INTO venues(id,name,description,address_label,city,location,created_by_user_id) VALUES($1,$2,$3,$4,$5,ST_SetSRID(ST_MakePoint($6,$7),4326)::geography,$8)`, id, strings.TrimSpace(in.Name), in.Description, in.AddressLabel, strings.TrimSpace(in.City), lon, lat, u.ID)
	if err != nil {
		http.Error(w, "venue suggestions unavailable", 500)
		return
	}
	writeJSON(w, 201, map[string]any{"id": id, "status": "pending"})
}

func validateArea(in areaInput) error {
	in.Label = strings.TrimSpace(in.Label)
	if in.Label == "" || len(in.Label) > 120 || !validPoint(in.Latitude, in.Longitude) || in.RadiusMeters < 500 || in.RadiusMeters > 25000 || in.Priority < 0 {
		return errors.New("Preferred area data is invalid.")
	}
	return nil
}

func (h Handler) preferredAreas(w http.ResponseWriter, r *http.Request) {
	u, _ := currentUser(r)
	switch r.Method {
	case http.MethodGet:
		h.listAreas(w, r, u.ID)
	case http.MethodPost:
		h.createArea(w, r, u.ID)
	default:
		w.WriteHeader(405)
	}
}
func (h Handler) listAreas(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	rows, err := h.DB.Query(r.Context(), `SELECT id,label,ST_Y(center::geometry),ST_X(center::geometry),radius_meters,priority,active FROM preferred_areas WHERE user_id=$1 AND active=true ORDER BY priority,id`, userID)
	if err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	defer rows.Close()
	items := []area{}
	for rows.Next() {
		var a area
		if err := rows.Scan(&a.ID, &a.Label, &a.Latitude, &a.Longitude, &a.RadiusMeters, &a.Priority, &a.Active); err != nil {
			http.Error(w, "preferred areas unavailable", 500)
			return
		}
		items = append(items, a)
	}
	writeJSON(w, 200, items)
}
func decodeArea(r *http.Request) (areaInput, error) {
	var in areaInput
	if err := json.NewDecoder(r.Body).Decode(&in); err != nil {
		return in, errors.New("Preferred area data is invalid.")
	}
	in.Label = strings.TrimSpace(in.Label)
	return in, validateArea(in)
}
func (h Handler) createArea(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	in, err := decodeArea(r)
	if err != nil {
		writeError(w, 422, "invalid_preferred_area", err.Error())
		return
	}
	tx, err := h.DB.Begin(r.Context())
	if err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	defer tx.Rollback(r.Context())
	if _, err = tx.Exec(r.Context(), `SELECT pg_advisory_xact_lock(hashtextextended($1::text, 0))`, userID); err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	var count int
	if err = tx.QueryRow(r.Context(), `SELECT count(*) FROM preferred_areas WHERE user_id=$1 AND active=true`, userID).Scan(&count); err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	if count >= maxActiveAreas {
		writeError(w, 409, "preferred_area_limit", "You can have up to 5 preferred areas.")
		return
	}
	lon, lat := pointArgs(in.Latitude, in.Longitude)
	var out area
	id := uuid.New()
	err = tx.QueryRow(r.Context(), `INSERT INTO preferred_areas(id,user_id,label,center,radius_meters,priority) VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint($4,$5),4326)::geography,$6,$7) RETURNING id,label,ST_Y(center::geometry),ST_X(center::geometry),radius_meters,priority,active`, id, userID, in.Label, lon, lat, in.RadiusMeters, in.Priority).Scan(&out.ID, &out.Label, &out.Latitude, &out.Longitude, &out.RadiusMeters, &out.Priority, &out.Active)
	if err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	if err = tx.Commit(r.Context()); err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	writeJSON(w, 201, out)
}
func (h Handler) preferredAreaByID(w http.ResponseWriter, r *http.Request) {
	u, _ := currentUser(r)
	id, err := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/me/preferred-areas/"), "/"))
	if err != nil {
		writeError(w, 404, "preferred_area_not_found", "Preferred area not found.")
		return
	}
	switch r.Method {
	case http.MethodPut:
		h.updateArea(w, r, u.ID, id)
	case http.MethodDelete:
		h.deleteArea(w, r, u.ID, id)
	default:
		w.WriteHeader(405)
	}
}
func (h Handler) updateArea(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	in, err := decodeArea(r)
	if err != nil {
		writeError(w, 422, "invalid_preferred_area", err.Error())
		return
	}
	lon, lat := pointArgs(in.Latitude, in.Longitude)
	var out area
	err = h.DB.QueryRow(r.Context(), `UPDATE preferred_areas SET label=$1,center=ST_SetSRID(ST_MakePoint($2,$3),4326)::geography,radius_meters=$4,priority=$5,updated_at=now() WHERE id=$6 AND user_id=$7 AND active=true RETURNING id,label,ST_Y(center::geometry),ST_X(center::geometry),radius_meters,priority,active`, in.Label, lon, lat, in.RadiusMeters, in.Priority, id, userID).Scan(&out.ID, &out.Label, &out.Latitude, &out.Longitude, &out.RadiusMeters, &out.Priority, &out.Active)
	if errors.Is(err, pgx.ErrNoRows) {
		writeError(w, 404, "preferred_area_not_found", "Preferred area not found.")
		return
	}
	if err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	writeJSON(w, 200, out)
}
func (h Handler) deleteArea(w http.ResponseWriter, r *http.Request, userID, id uuid.UUID) {
	tag, err := h.DB.Exec(r.Context(), `UPDATE preferred_areas SET active=false,updated_at=now() WHERE id=$1 AND user_id=$2 AND active=true`, id, userID)
	if err != nil {
		http.Error(w, "preferred areas unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "preferred_area_not_found", "Preferred area not found.")
		return
	}
	w.WriteHeader(204)
}

func (h Handler) favoriteVenues(w http.ResponseWriter, r *http.Request) {
	u, _ := currentUser(r)
	switch r.Method {
	case http.MethodGet:
		rows, err := h.DB.Query(r.Context(), `SELECT v.id,v.name,v.description,v.address_label,v.city,ST_Y(v.location::geometry),ST_X(v.location::geometry),v.lighting_status,v.surface_type,v.access_type,v.active FROM user_favorite_venues f JOIN venues v ON v.id=f.venue_id WHERE f.user_id=$1 AND v.active=true ORDER BY f.priority,f.created_at`, u.ID)
		if err != nil {
			http.Error(w, "favorite venues unavailable", 500)
			return
		}
		defer rows.Close()
		items := []venue{}
		for rows.Next() {
			var v venue
			if err := rows.Scan(&v.ID, &v.Name, &v.Description, &v.AddressLabel, &v.City, &v.Latitude, &v.Longitude, &v.LightingStatus, &v.SurfaceType, &v.AccessType, &v.Active); err != nil {
				http.Error(w, "favorite venues unavailable", 500)
				return
			}
			items = append(items, v)
		}
		writeJSON(w, 200, items)
	case http.MethodPost:
		h.addFavorite(w, r, u.ID)
	default:
		w.WriteHeader(405)
	}
}
func (h Handler) addFavorite(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	id, err := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/me/favorite-venues/"), "/"))
	if err != nil {
		writeError(w, 404, "venue_not_found", "Venue not found.")
		return
	}
	var active bool
	err = h.DB.QueryRow(r.Context(), `SELECT active FROM venues WHERE id=$1 AND (approved_at IS NOT NULL OR created_by_user_id=$2)`, id, userID).Scan(&active)
	if errors.Is(err, pgx.ErrNoRows) || !active {
		writeError(w, 404, "venue_not_found", "Venue not found.")
		return
	}
	_, err = h.DB.Exec(r.Context(), `INSERT INTO user_favorite_venues(user_id,venue_id,priority) VALUES($1,$2,0) ON CONFLICT(user_id,venue_id) DO NOTHING`, userID, id)
	if err != nil {
		http.Error(w, "favorite venues unavailable", 500)
		return
	}
	w.WriteHeader(204)
}
func (h Handler) favoriteVenueByID(w http.ResponseWriter, r *http.Request) {
	u, _ := currentUser(r)
	if r.Method == http.MethodPost {
		h.addFavorite(w, r, u.ID)
		return
	}
	if r.Method != http.MethodDelete {
		w.WriteHeader(405)
		return
	}
	id, err := uuid.Parse(strings.Trim(strings.TrimPrefix(r.URL.Path, "/api/v1/me/favorite-venues/"), "/"))
	if err != nil {
		writeError(w, 404, "venue_not_found", "Venue not found.")
		return
	}
	tag, err := h.DB.Exec(r.Context(), `DELETE FROM user_favorite_venues WHERE user_id=$1 AND venue_id=$2`, u.ID, id)
	if err != nil {
		http.Error(w, "favorite venues unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "favorite_venue_not_found", "Favorite venue not found.")
		return
	}
	w.WriteHeader(204)
}

func (h Handler) adminSuggestions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	rows, err := h.DB.Query(r.Context(), `SELECT id,name,description,address_label,city,ST_Y(location::geometry),ST_X(location::geometry),created_at FROM venues WHERE active=false AND approved_at IS NULL AND rejected_at IS NULL ORDER BY created_at`)
	if err != nil {
		http.Error(w, "venue suggestions unavailable", 500)
		return
	}
	defer rows.Close()
	items := []venueSuggestion{}
	for rows.Next() {
		var item venueSuggestion
		if err := rows.Scan(&item.ID, &item.Name, &item.Description, &item.AddressLabel, &item.City, &item.Latitude, &item.Longitude, &item.CreatedAt); err != nil {
			http.Error(w, "venue suggestions unavailable", 500)
			return
		}
		items = append(items, item)
	}
	writeJSON(w, 200, items)
}

func (h Handler) adminSuggestionAction(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	raw := strings.TrimPrefix(r.URL.Path, "/api/v1/admin/venues/suggestions/")
	parts := strings.Split(strings.Trim(raw, "/"), "/")
	if len(parts) != 2 {
		writeError(w, 404, "venue_suggestion_not_found", "Venue suggestion not found.")
		return
	}
	id, err := uuid.Parse(parts[0])
	if err != nil {
		writeError(w, 404, "venue_suggestion_not_found", "Venue suggestion not found.")
		return
	}
	var query string
	switch parts[1] {
	case "approve":
		query = `UPDATE venues SET active=true,approved_at=now(),rejected_at=NULL,updated_at=now() WHERE id=$1 AND active=false AND approved_at IS NULL AND rejected_at IS NULL`
	case "reject":
		query = `UPDATE venues SET rejected_at=now(),updated_at=now() WHERE id=$1 AND active=false AND approved_at IS NULL AND rejected_at IS NULL`
	default:
		writeError(w, 404, "venue_suggestion_not_found", "Venue suggestion not found.")
		return
	}
	tag, err := h.DB.Exec(r.Context(), query, id)
	if err != nil {
		http.Error(w, "venue suggestions unavailable", 500)
		return
	}
	if tag.RowsAffected() == 0 {
		writeError(w, 404, "venue_suggestion_not_found", "Venue suggestion not found.")
		return
	}
	actor, _ := auth.UserFromContext(r.Context())
	action := audit.VenueRejected
	if parts[1] == "approve" {
		action = audit.VenueApproved
	}
	if err := audit.Record(r.Context(), h.DB, actor.ID, action, "venue", id, nil); err != nil {
		http.Error(w, "venue suggestions unavailable", 500)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
func writeError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"code": code, "message": message, "fields": map[string]string{}}})
}
