package email

import (
	"context"
	"strings"
	"testing"
)

func TestRenderBodyIncludesPlaintextAndHTMLParts(t *testing.T) {
	body, boundary, err := renderBody(Message{Body: "Plain fallback", HTMLBody: "<p>HTML button</p>"})
	if err != nil {
		t.Fatal(err)
	}
	if boundary == "" {
		t.Fatal("multipart boundary is empty")
	}
	raw := string(body)
	for _, fragment := range []string{"text/plain; charset=UTF-8", "text/html; charset=UTF-8", "Plain fallback", "HTML button", "--" + boundary} {
		if !strings.Contains(raw, fragment) {
			t.Fatalf("body missing %q: %s", fragment, raw)
		}
	}
}

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
