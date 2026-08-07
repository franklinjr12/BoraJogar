package location

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/google/uuid"
)

func locationRequest(method, path, body string, user auth.User) (*httptest.ResponseRecorder, *http.Request) {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	req = req.WithContext(auth.WithUserContext(context.Background(), user))
	return httptest.NewRecorder(), req
}

func TestInvalidLocationRequestsDoNotAccessDatabase(t *testing.T) {
	h := Handler{}
	u := auth.User{ID: uuid.New()}
	for _, test := range []struct{ name, method, path, body, code string }{
		{"bad coordinates", http.MethodGet, "/api/v1/venues?latitude=91&longitude=0", "", "invalid_location"},
		{"bad suggestion", http.MethodPost, "/api/v1/venues/suggestions", `{"name":"","city":"São Paulo","latitude":0,"longitude":0}`, "invalid_venue_suggestion"},
		{"bad owned venue", http.MethodPost, "/api/v1/me/venues", `{"name":"","city":"Sao Paulo","latitude":0,"longitude":0}`, "invalid_venue"},
		{"bad area json", http.MethodPost, "/api/v1/me/preferred-areas", `{`, "invalid_preferred_area"},
	} {
		t.Run(test.name, func(t *testing.T) {
			w, r := locationRequest(test.method, test.path, test.body, u)
			if strings.HasPrefix(test.path, "/api/v1/venues?") {
				h.venues(w, r)
			} else if strings.Contains(test.path, "/suggestions") {
				h.suggestVenue(w, r)
			} else if strings.Contains(test.path, "/me/venues") {
				h.ownedVenues(w, r)
			} else {
				h.createArea(w, r, u.ID)
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

func TestAreaValidationCoversBoundsAndPriority(t *testing.T) {
	valid := areaInput{Label: "Pinheiros", Latitude: -23.56, Longitude: -46.68, RadiusMeters: 500, Priority: 0}
	if err := validateArea(valid); err != nil {
		t.Fatal(err)
	}
	for _, invalid := range []areaInput{
		{Label: strings.Repeat("x", 121), Latitude: 0, Longitude: 0, RadiusMeters: 500},
		{Label: "Area", Latitude: -90.1, Longitude: 0, RadiusMeters: 500},
		{Label: "Area", Latitude: 0, Longitude: 180.1, RadiusMeters: 500},
		{Label: "Area", Latitude: 0, Longitude: 0, RadiusMeters: 25001},
		{Label: "Area", Latitude: 0, Longitude: 0, RadiusMeters: 500, Priority: -1},
	} {
		if err := validateArea(invalid); err == nil {
			t.Fatalf("expected rejection: %+v", invalid)
		}
	}
}

func TestMapsConfigRequiresConfiguredKey(t *testing.T) {
	u := auth.User{ID: uuid.New()}
	for _, test := range []struct {
		name   string
		h      Handler
		status int
		code   string
	}{
		{name: "missing key", h: Handler{}, status: http.StatusServiceUnavailable, code: "maps_unavailable"},
	} {
		t.Run(test.name, func(t *testing.T) {
			w, r := locationRequest(http.MethodGet, "/api/v1/me/maps-config", "", u)
			test.h.mapsConfig(w, r)
			if w.Code != test.status {
				t.Fatalf("status = %d, want %d", w.Code, test.status)
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
				t.Fatalf("error code = %q, want %q", response.Error.Code, test.code)
			}
		})
	}
}

func TestMapsConfigReturnsOnlyBrowserKey(t *testing.T) {
	w, r := locationRequest(http.MethodGet, "/api/v1/me/maps-config", "", auth.User{ID: uuid.New()})
	(Handler{GoogleMapsAPIKey: "browser-key"}).mapsConfig(w, r)
	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var response map[string]string
	if err := json.NewDecoder(w.Body).Decode(&response); err != nil {
		t.Fatal(err)
	}
	if response["googleMapsApiKey"] != "browser-key" || len(response) != 1 {
		t.Fatalf("unexpected maps config: %#v", response)
	}
}
