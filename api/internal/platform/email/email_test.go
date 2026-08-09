package email

import (
	"context"
	"testing"
)

func TestSMTPRejectsHeaderInjection(t *testing.T) {
	err := (SMTP{Host: "localhost", Port: 1025, FromAddress: "no-reply@example.com"}).Send(context.Background(), Message{
		To:      "player@example.com",
		Subject: "Bora Jogar\r\nBcc: attacker@example.com",
		Body:    "body",
	})
	if err == nil {
		t.Fatal("expected header validation error")
	}
}

func TestSMTPRejectsInvalidCustomHeader(t *testing.T) {
	err := (SMTP{Host: "localhost", Port: 1025, FromAddress: "no-reply@example.com"}).Send(context.Background(), Message{
		To:      "player@example.com",
		Subject: "Subject",
		Body:    "body",
		Headers: map[string]string{"X-Test\r\nBcc": "attacker@example.com"},
	})
	if err == nil {
		t.Fatal("expected custom header validation error")
	}
}
