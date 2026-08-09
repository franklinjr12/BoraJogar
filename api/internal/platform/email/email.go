package email

import (
	"context"
	"errors"
	"fmt"
	"net/smtp"
	"strings"
)

type Message struct {
	To, Subject, Body string
	Headers           map[string]string
}
type Sender interface {
	Send(context.Context, Message) error
}
type SMTP struct {
	Host                                      string
	Port                                      int
	Username, Password, FromAddress, FromName string
}

func (s SMTP) Send(ctx context.Context, message Message) error {
	select {
	case <-ctx.Done():
		return ctx.Err()
	default:
	}
	for field, value := range map[string]string{"To": message.To, "Subject": message.Subject, "From": s.FromAddress, "FromName": s.FromName} {
		if strings.ContainsAny(value, "\r\n") {
			return fmt.Errorf("email %s contains a newline", field)
		}
	}
	for name, value := range message.Headers {
		if strings.TrimSpace(name) == "" || strings.ContainsAny(name+value, "\r\n") {
			return errors.New("email header contains invalid characters")
		}
	}
	from := s.FromAddress
	if s.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.FromName, s.FromAddress)
	}
	var headers strings.Builder
	fmt.Fprintf(&headers, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n", from, message.To, message.Subject)
	for name, value := range message.Headers {
		fmt.Fprintf(&headers, "%s: %s\r\n", name, value)
	}
	body := []byte(headers.String() + "\r\n" + message.Body)
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	return smtp.SendMail(fmt.Sprintf("%s:%d", s.Host, s.Port), auth, s.FromAddress, []string{message.To}, body)
}
