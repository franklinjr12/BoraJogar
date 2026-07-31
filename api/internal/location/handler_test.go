package location

import "testing"

func TestValidateArea(t *testing.T) {
	if err := validateArea(areaInput{Label: "  Pinheiros ", Latitude: -23.56, Longitude: -46.68, RadiusMeters: 2500}); err != nil {
		t.Fatal(err)
	}
	cases := []areaInput{
		{Label: "", Latitude: 0, Longitude: 0, RadiusMeters: 500},
		{Label: "Area", Latitude: 91, Longitude: 0, RadiusMeters: 500},
		{Label: "Area", Latitude: 0, Longitude: 181, RadiusMeters: 500},
		{Label: "Area", Latitude: 0, Longitude: 0, RadiusMeters: 499},
		{Label: "Area", Latitude: 0, Longitude: 0, RadiusMeters: 25001},
	}
	for _, input := range cases {
		if err := validateArea(input); err == nil {
			t.Fatalf("expected invalid area: %+v", input)
		}
	}
}
