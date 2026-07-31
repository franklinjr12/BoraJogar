//go:build integration

package location

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationHandler(t *testing.T) (*Handler, auth.User, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(context.Background()); err != nil {
		db.Close()
		t.Fatal(err)
	}
	u := auth.User{ID: uuid.New(), IsAdmin: true}
	_, err = db.Exec(context.Background(), `INSERT INTO users(id,google_subject,email,display_name) VALUES($1,$2,$3,$4)`, u.ID, "location-test-"+u.ID.String(), "location-"+u.ID.String()+"@example.com", "Location Test")
	if err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, u.ID); db.Close() })
	h := &Handler{DB: db}
	return h, u, db
}

func integrationRequest(method, path, body string, user auth.User) *http.Request {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	return req.WithContext(auth.WithUserContext(context.Background(), user))
}

func TestPreferredAreaCRUDAndLimitIntegration(t *testing.T) {
	h, user, db := integrationHandler(t)
	for i := 0; i < maxActiveAreas; i++ {
		_, err := db.Exec(context.Background(), `INSERT INTO preferred_areas(id,user_id,label,center,radius_meters,priority) VALUES($1,$2,$3,ST_SetSRID(ST_MakePoint(-46.6,-23.5),4326)::geography,500,$4)`, uuid.New(), user.ID, "Existing", i)
		if err != nil {
			t.Fatal(err)
		}
	}
	w := httptest.NewRecorder()
	h.createArea(w, integrationRequest(http.MethodPost, "/api/v1/me/preferred-areas", `{"label":"Extra","latitude":-23.5,"longitude":-46.6,"radiusMeters":500}`, user), user.ID)
	if w.Code != http.StatusConflict {
		t.Fatalf("limit status = %d", w.Code)
	}
	_, _ = db.Exec(context.Background(), `DELETE FROM preferred_areas WHERE user_id=$1`, user.ID)
	w = httptest.NewRecorder()
	h.createArea(w, integrationRequest(http.MethodPost, "/api/v1/me/preferred-areas", `{"label":"Home","latitude":-23.5,"longitude":-46.6,"radiusMeters":500}`, user), user.ID)
	if w.Code != http.StatusCreated {
		t.Fatalf("create status = %d, body=%s", w.Code, w.Body.String())
	}
	var created area
	if err := json.NewDecoder(w.Body).Decode(&created); err != nil {
		t.Fatal(err)
	}
	other := auth.User{ID: uuid.New()}
	w = httptest.NewRecorder()
	h.updateArea(w, integrationRequest(http.MethodPut, "/api/v1/me/preferred-areas/"+created.ID, `{"label":"Hijack","latitude":0,"longitude":0,"radiusMeters":500}`, other), other.ID, uuid.MustParse(created.ID))
	if w.Code != http.StatusNotFound {
		t.Fatalf("cross-user update status = %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.updateArea(w, integrationRequest(http.MethodPut, "/api/v1/me/preferred-areas/"+created.ID, `{"label":"Updated","latitude":-23.51,"longitude":-46.61,"radiusMeters":1000}`, user), user.ID, uuid.MustParse(created.ID))
	if w.Code != http.StatusOK {
		t.Fatalf("update status = %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.deleteArea(w, integrationRequest(http.MethodDelete, "/api/v1/me/preferred-areas/"+created.ID, "", user), user.ID, uuid.MustParse(created.ID))
	if w.Code != http.StatusNoContent {
		t.Fatalf("delete status = %d", w.Code)
	}
}

func TestVenueFavoriteAndSuggestionReviewIntegration(t *testing.T) {
	h, user, db := integrationHandler(t)
	venueID := uuid.New()
	_, err := db.Exec(context.Background(), `INSERT INTO venues(id,name,city,location,active,approved_at) VALUES($1,'Court','São Paulo',ST_SetSRID(ST_MakePoint(-46.6,-23.5),4326)::geography,true,now())`, venueID)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(context.Background(), `DELETE FROM venues WHERE id=$1`, venueID) })
	w := httptest.NewRecorder()
	h.addFavorite(w, integrationRequest(http.MethodPost, "/api/v1/me/favorite-venues/"+venueID.String(), "", user), user.ID)
	if w.Code != http.StatusNoContent {
		t.Fatalf("favorite status = %d", w.Code)
	}
	w = httptest.NewRecorder()
	h.venues(w, integrationRequest(http.MethodGet, "/api/v1/venues?city=S%C3%A3o%20Paulo", "", user))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), venueID.String()) {
		t.Fatalf("venues response = %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	h.favoriteVenueByID(w, integrationRequest(http.MethodDelete, "/api/v1/me/favorite-venues/"+venueID.String(), "", user))
	if w.Code != http.StatusNoContent {
		t.Fatalf("unfavorite status = %d", w.Code)
	}
	var suggestionID uuid.UUID
	err = db.QueryRow(context.Background(), `INSERT INTO venues(id,name,city,location,created_by_user_id) VALUES($1,'Pending','São Paulo',ST_SetSRID(ST_MakePoint(-46.61,-23.51),4326)::geography,$2) RETURNING id`, uuid.New(), user.ID).Scan(&suggestionID)
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	h.adminSuggestions(w, integrationRequest(http.MethodGet, "/api/v1/admin/venues/suggestions", "", user))
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), suggestionID.String()) {
		t.Fatalf("pending suggestions response = %d %s", w.Code, w.Body.String())
	}
	w = httptest.NewRecorder()
	h.adminSuggestionAction(w, integrationRequest(http.MethodPost, "/api/v1/admin/venues/suggestions/"+suggestionID.String()+"/approve", "", user))
	if w.Code != http.StatusNoContent {
		t.Fatalf("approve status = %d", w.Code)
	}
	var active bool
	if err := db.QueryRow(context.Background(), `SELECT active FROM venues WHERE id=$1`, suggestionID).Scan(&active); err != nil || !active {
		t.Fatalf("approved venue active = %v, err=%v", active, err)
	}
	var rejectedID uuid.UUID
	err = db.QueryRow(context.Background(), `INSERT INTO venues(id,name,city,location,created_by_user_id) VALUES($1,'Rejected','São Paulo',ST_SetSRID(ST_MakePoint(-46.62,-23.52),4326)::geography,$2) RETURNING id`, uuid.New(), user.ID).Scan(&rejectedID)
	if err != nil {
		t.Fatal(err)
	}
	w = httptest.NewRecorder()
	h.adminSuggestionAction(w, integrationRequest(http.MethodPost, "/api/v1/admin/venues/suggestions/"+rejectedID.String()+"/reject", "", user))
	if w.Code != http.StatusNoContent {
		t.Fatalf("reject status = %d", w.Code)
	}
	var rejectedAt *time.Time
	if err := db.QueryRow(context.Background(), `SELECT rejected_at FROM venues WHERE id=$1`, rejectedID).Scan(&rejectedAt); err != nil || rejectedAt == nil {
		t.Fatalf("rejected_at = %v, err=%v", rejectedAt, err)
	}
}
