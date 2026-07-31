package profile

import "testing"

func TestValidateProfileInputNormalizesAndGatesMatchmaking(t *testing.T) {
	bio := "  beach volleyball fan  "
	active := true
	got, err := validateProfileInput(profileInput{DisplayName: " Ana ", TimeZone: "America/Sao_Paulo", SkillLevel: "beginner", Bio: &bio, Styles: []string{"casual"}, PreferredGameDurationMinutes: 90, MinimumNoticeMinutes: 120, ActiveForMatchmaking: &active}, false)
	if err != nil {
		t.Fatal(err)
	}
	if got.DisplayName != "Ana" || *got.Bio != "beach volleyball fan" || *got.ActiveForMatchmaking {
		t.Fatalf("normalized profile = %+v", got)
	}
	got, err = validateProfileInput(profileInput{DisplayName: "Ana", TimeZone: "UTC", SkillLevel: "intermediate", Styles: []string{"mixed"}, PreferredGameDurationMinutes: 60, ActiveForMatchmaking: &active}, true)
	if err != nil || !*got.ActiveForMatchmaking {
		t.Fatalf("completed profile should activate matchmaking: %+v, %v", got, err)
	}
}

func TestValidateProfileInputRejectsInvalidValues(t *testing.T) {
	cases := []profileInput{
		{DisplayName: "A", TimeZone: "UTC", SkillLevel: "beginner", Styles: []string{"casual"}, PreferredGameDurationMinutes: 90},
		{DisplayName: "Ana", TimeZone: "Mars/Phobos", SkillLevel: "beginner", Styles: []string{"casual"}, PreferredGameDurationMinutes: 90},
		{DisplayName: "Ana", TimeZone: "UTC", SkillLevel: "beginner", Styles: []string{"casual", "casual"}, PreferredGameDurationMinutes: 90},
		{DisplayName: "Ana", TimeZone: "UTC", SkillLevel: "beginner", Styles: []string{"casual"}, PreferredGameDurationMinutes: 45},
	}
	for _, input := range cases {
		if _, err := validateProfileInput(input, true); err == nil {
			t.Fatalf("expected invalid profile rejection: %+v", input)
		}
	}
}

func TestValidateProgress(t *testing.T) {
	if err := validateProgress(progress{CurrentStep: 8, CompletedSteps: []int{0, 4, 8}}); err != nil {
		t.Fatal(err)
	}
	if err := validateProgress(progress{CurrentStep: 9}); err == nil {
		t.Fatal("expected current step rejection")
	}
	if err := validateProgress(progress{CurrentStep: 1, CompletedSteps: []int{-1}}); err == nil {
		t.Fatal("expected completed step rejection")
	}
}
