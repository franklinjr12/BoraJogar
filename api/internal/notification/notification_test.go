package notification

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/platform/email"
	"github.com/google/uuid"
)

type recordingEmailSender struct {
	messages []email.Message
}

func (s *recordingEmailSender) Send(_ context.Context, message email.Message) error {
	s.messages = append(s.messages, message)
	return nil
}

func TestReminderTimesSkipsPastReminders(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	got := ReminderTimes(now.Add(23*time.Hour), now)
	if len(got) != 1 || !got[0].Equal(now.Add(21*time.Hour)) {
		t.Fatalf("got %v", got)
	}
}
func TestReminderTimesSchedulesBoth(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	got := ReminderTimes(now.Add(48*time.Hour), now)
	if len(got) != 2 || !got[0].Equal(now.Add(24*time.Hour)) || !got[1].Equal(now.Add(46*time.Hour)) {
		t.Fatalf("got %v", got)
	}
}
func TestEndpointHashNotPlaintext(t *testing.T) {
	if EndpointHash("https://push.example/sub") == "https://push.example/sub" {
		t.Fatal("endpoint leaked")
	}
}

func TestReminderTimesReturnsNoPastReminders(t *testing.T) {
	now := time.Date(2026, 1, 1, 12, 0, 0, 0, time.UTC)
	if got := ReminderTimes(now.Add(time.Hour), now); len(got) != 0 {
		t.Fatalf("past reminders = %v", got)
	}
}

func TestEmailChannelSendsRecipientSubjectBodyAndAbsoluteActionURL(t *testing.T) {
	sender := &recordingEmailSender{}
	channel := EmailChannel{Sender: sender}

	err := channel.Send(context.Background(), Delivery{
		To:        "player@example.com",
		Title:     "New game proposal",
		Body:      "Review your proposal.",
		ActionURL: "https://borajogar.example/proposals/123",
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(sender.messages) != 1 {
		t.Fatalf("messages = %d, want 1", len(sender.messages))
	}
	message := sender.messages[0]
	if message.To != "player@example.com" || message.Subject != "New game proposal" {
		t.Fatalf("message = %+v", message)
	}
	if message.Headers["Resend-Idempotency-Key"] == "" {
		t.Fatalf("headers = %+v", message.Headers)
	}
	if !strings.Contains(message.Body, "Review your proposal.") || !strings.Contains(message.Body, "https://borajogar.example/proposals/123") {
		t.Fatalf("body = %q", message.Body)
	}
	if !strings.Contains(message.HTMLBody, ">Abrir partida<") || !strings.Contains(message.HTMLBody, "https://borajogar.example/proposals/123") {
		t.Fatalf("html body = %q", message.HTMLBody)
	}
}

func TestEmailChannelRendersCancellationDetailsInRecipientTimezone(t *testing.T) {
	title := "Saturday <final>"
	address := "Court <entrance>"
	reason := "Weather <alert>"
	payload, err := json.Marshal(GameCancellationPayload{
		GameID:       "game-1",
		Title:        &title,
		StartsAt:     time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC),
		EndsAt:       time.Date(2026, 8, 2, 13, 30, 0, 0, time.UTC),
		VenueName:    "Central court",
		AddressLabel: &address,
		Reason:       &reason,
	})
	if err != nil {
		t.Fatal(err)
	}
	sender := &recordingEmailSender{}
	err = (EmailChannel{Sender: sender, DefaultTimezone: "America/Sao_Paulo"}).Send(context.Background(), Delivery{
		ID:        uuid.New(),
		Type:      GameCancelled,
		To:        "player@example.com",
		Title:     "Partida cancelada",
		Body:      "O organizador cancelou esta partida.",
		ActionURL: "https://borajogar.example/games/game-1",
		TimeZone:  "America/New_York",
		Payload:   payload,
	})
	if err != nil {
		t.Fatal(err)
	}
	message := sender.messages[0]
	for _, fragment := range []string{
		"Data e horário: 02/08/2026, 08:00–09:30 (America/New_York)",
		"Local: Central court",
		"Endereço: Court <entrance>",
		"Motivo: Weather <alert>",
	} {
		if !strings.Contains(message.Body, fragment) {
			t.Fatalf("body missing %q: %q", fragment, message.Body)
		}
	}
	if !strings.Contains(message.HTMLBody, "&lt;final&gt;") || !strings.Contains(message.HTMLBody, "&lt;entrance&gt;") || !strings.Contains(message.HTMLBody, ">Abrir partida<") {
		t.Fatalf("html body is not escaped/buttonized: %q", message.HTMLBody)
	}
}

func TestEmailChannelCancellationUsesDefaultTimezoneWhenRecipientTimezoneInvalid(t *testing.T) {
	payload, err := json.Marshal(GameCancellationPayload{
		StartsAt:  time.Date(2026, 8, 2, 12, 0, 0, 0, time.UTC),
		EndsAt:    time.Date(2026, 8, 2, 13, 30, 0, 0, time.UTC),
		VenueName: "Central court",
	})
	if err != nil {
		t.Fatal(err)
	}
	sender := &recordingEmailSender{}
	err = (EmailChannel{Sender: sender, DefaultTimezone: "America/Sao_Paulo"}).Send(context.Background(), Delivery{
		ID:       uuid.New(),
		Type:     GameCancelled,
		To:       "player@example.com",
		Title:    "Partida cancelada",
		Body:     "Cancelada.",
		TimeZone: "Mars/Phobos",
		Payload:  payload,
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(sender.messages[0].Body, "02/08/2026, 09:00–10:30 (America/Sao_Paulo)") {
		t.Fatalf("fallback timezone not used: %q", sender.messages[0].Body)
	}
}

func TestEmailChannelRejectsMissingRecipient(t *testing.T) {
	err := (EmailChannel{Sender: &recordingEmailSender{}}).Send(context.Background(), Delivery{Title: "Missing recipient"})
	if err == nil || err.Error() != "email recipient unavailable" {
		t.Fatalf("error = %v", err)
	}
}

func TestAbsoluteActionURL(t *testing.T) {
	if got := absoluteActionURL("https://borajogar.example", "/games/123"); got != "https://borajogar.example/games/123" {
		t.Fatalf("absolute URL = %q", got)
	}
	if got := absoluteActionURL("https://borajogar.example", "https://other.example/action"); got != "https://other.example/action" {
		t.Fatalf("existing absolute URL = %q", got)
	}
}
