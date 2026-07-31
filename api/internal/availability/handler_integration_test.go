//go:build integration

package availability

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

func integrationAvailabilityHandler(t *testing.T) (*Handler, auth.User, *pgxpool.Pool) {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err = db.Ping(context.Background()); err != nil {
		db.Close()
		t.Fatal(err)
	}
	user := auth.User{ID: uuid.New()}
	if _, err = db.Exec(context.Background(), `INSERT INTO users(id,google_subject,email,display_name) VALUES($1,$2,$3,$4)`, user.ID, "availability-test-"+user.ID.String(), "availability-"+user.ID.String()+"@example.com", "Availability Test"); err != nil {
		db.Close()
		t.Fatal(err)
	}
	areaID := uuid.New()
	if _, err = db.Exec(context.Background(), `INSERT INTO preferred_areas(id,user_id,label,center,radius_meters) VALUES($1,$2,'Near home',ST_SetSRID(ST_MakePoint(-46.6,-23.5),4326)::geography,500)`, areaID, user.ID); err != nil {
		db.Close()
		t.Fatal(err)
	}
	t.Cleanup(func() { _, _ = db.Exec(context.Background(), `DELETE FROM users WHERE id=$1`, user.ID); db.Close() })
	return &Handler{DB: db}, user, db
}

func TestAvailabilityRuleExceptionAndCalendarIntegration(t *testing.T) {
	h, user, db := integrationAvailabilityHandler(t)
	request := func(method, path, body string) *httptest.ResponseRecorder {
		r := httptest.NewRequest(method, path, strings.NewReader(body)).WithContext(auth.WithUserContext(context.Background(), user))
		w := httptest.NewRecorder()
		if strings.Contains(path, "/exceptions") {
			h.createException(w, r, user.ID)
		} else {
			h.createRule(w, r, user.ID)
		}
		return w
	}
	var areaID string
	if err := db.QueryRow(context.Background(), `SELECT id::text FROM preferred_areas WHERE user_id=$1 LIMIT 1`, user.ID).Scan(&areaID); err != nil {
		t.Fatal(err)
	}
	ruleResponse := request(http.MethodPost, "/api/v1/me/availability/rules", `{"weekday":1,"start":"07:00","end":"09:00","timezone":"America/Sao_Paulo","validFrom":"2026-07-27","preferredAreaIds":["`+areaID+`"]}`)
	if ruleResponse.Code != http.StatusOK {
		t.Fatalf("rule create status = %d, body=%s", ruleResponse.Code, ruleResponse.Body.String())
	}
	exceptionResponse := request(http.MethodPost, "/api/v1/me/availability/exceptions", `{"date":"2026-07-27","type":"unavailable_interval","start":"08:00","end":"08:30","timezone":"America/Sao_Paulo"}`)
	if exceptionResponse.Code != http.StatusCreated {
		t.Fatalf("exception create status = %d, body=%s", exceptionResponse.Code, exceptionResponse.Body.String())
	}
	if err := ExpandFuture(context.Background(), db, time.Date(2026, 7, 27, 0, 0, 0, 0, time.UTC)); err != nil {
		t.Fatal(err)
	}
	var occurrences int
	if err := db.QueryRow(context.Background(), `SELECT count(*) FROM availability_occurrences WHERE user_id=$1 AND starts_at >= '2026-07-27T00:00:00Z'`, user.ID).Scan(&occurrences); err != nil {
		t.Fatal(err)
	}
	if occurrences != 2 {
		t.Fatalf("occurrences = %d, want split interval into 2", occurrences)
	}
	calendarRequest := httptest.NewRequest(http.MethodGet, "/api/v1/me/availability/calendar?from=2026-07-27&to=2026-07-29", nil).WithContext(auth.WithUserContext(context.Background(), user))
	w := httptest.NewRecorder()
	h.calendar(w, calendarRequest, user.ID)
	if w.Code != http.StatusOK {
		t.Fatalf("calendar status = %d", w.Code)
	}
	var calendar []calendarItem
	if err := json.NewDecoder(w.Body).Decode(&calendar); err != nil {
		t.Fatal(err)
	}
	if len(calendar) != 2 || calendar[0].EndsAt.Sub(calendar[0].StartsAt) != time.Hour {
		t.Fatalf("calendar = %#v", calendar)
	}
}
