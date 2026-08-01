package availability

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
)

func availabilityRequest(method, path, body string, user auth.User) (*httptest.ResponseRecorder, *http.Request) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	return httptest.NewRecorder(), req.WithContext(auth.WithUserContext(context.Background(), user))
}

func TestInvalidAvailabilityRequestsDoNotAccessDatabase(t *testing.T) {
	h := Handler{}
	u := auth.User{ID: uuid.New()}
	tests := []struct{ name, method, path, body, code string }{
		{"invalid rule JSON", http.MethodPost, "/api/v1/me/availability/rules", "{", "invalid_availability_rule"},
		{"rule without location", http.MethodPost, "/api/v1/me/availability/rules", `{"weekday":1,"start":"07:00","end":"09:00","timezone":"UTC","validFrom":"2026-07-27"}`, "invalid_availability_rule"},
		{"invalid exception", http.MethodPost, "/api/v1/me/availability/exceptions", `{"date":"2026-07-27","type":"unavailable_interval","start":"09:00","end":"08:00","timezone":"UTC"}`, "invalid_availability_exception"},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			w, r := availabilityRequest(test.method, test.path, test.body, u)
			if strings.Contains(test.path, "/rules") {
				h.createRule(w, r, u.ID)
			} else {
				h.createException(w, r, u.ID)
			}
			if w.Code != http.StatusUnprocessableEntity {
				t.Fatalf("status = %d", w.Code)
			}
			var response struct {
				Error struct {
					Code string `json:"code"`
				} `json:"error"`
			}
			if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
				t.Fatal(err)
			}
			if response.Error.Code != test.code {
				t.Fatalf("error code = %q", response.Error.Code)
			}
		})
	}
}

func TestCalendarRejectsInvalidRangeWithoutDatabase(t *testing.T) {
	h := Handler{}
	u := auth.User{ID: uuid.New()}
	w, r := availabilityRequest(http.MethodGet, "/api/v1/me/availability/calendar?from=2026-07-29&to=2026-07-28", "", u)
	h.calendar(w, r, u.ID)
	if w.Code != http.StatusUnprocessableEntity {
		t.Fatalf("status = %d", w.Code)
	}
}

func TestAvailabilityResponsesUseOpenAPIJSONKeys(t *testing.T) {
	ruleBody, err := json.Marshal(ruleResponse{
		ID: "rule-1", Weekday: 6, Start: "07:00", End: "09:00", Timezone: "America/Sao_Paulo", ValidFrom: "2026-08-01", Active: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"start"`, `"end"`, `"timezone"`, `"validFrom"`} {
		if !strings.Contains(string(ruleBody), key) {
			t.Fatalf("rule response missing %s: %s", key, ruleBody)
		}
	}
	for _, key := range []string{`"Start"`, `"End"`, `"Timezone"`, `"ValidFrom"`} {
		if strings.Contains(string(ruleBody), key) {
			t.Fatalf("rule response includes non-contract key %s: %s", key, ruleBody)
		}
	}

	exceptionBody, err := json.Marshal(exceptionResponse{ID: "exception-1", Date: "2026-08-01", Type: "available_interval", Start: "07:00", End: "09:00", Timezone: "America/Sao_Paulo"})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"date"`, `"type"`, `"start"`, `"end"`, `"timezone"`} {
		if !strings.Contains(string(exceptionBody), key) {
			t.Fatalf("exception response missing %s: %s", key, exceptionBody)
		}
	}

	calendarBody, err := json.Marshal(calendarItem{StartsAt: time.Date(2026, 8, 1, 10, 0, 0, 0, time.UTC), EndsAt: time.Date(2026, 8, 1, 12, 0, 0, 0, time.UTC), SourceType: "rule", SourceID: "rule-1"})
	if err != nil {
		t.Fatal(err)
	}
	for _, key := range []string{`"startsAt"`, `"endsAt"`, `"sourceType"`, `"sourceId"`} {
		if !strings.Contains(string(calendarBody), key) {
			t.Fatalf("calendar response missing %s: %s", key, calendarBody)
		}
	}
}
