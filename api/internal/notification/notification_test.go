package notification

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/borajogar/borajogar/api/internal/platform/email"
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
