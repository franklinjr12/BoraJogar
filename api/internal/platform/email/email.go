package email

import (
	"context"
	"fmt"
	"net/smtp"
)

type Message struct{ To, Subject, Body string }
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
	from := s.FromAddress
	if s.FromName != "" {
		from = fmt.Sprintf("%s <%s>", s.FromName, s.FromAddress)
	}
	body := []byte("From: " + from + "\r\nTo: " + message.To + "\r\nSubject: " + message.Subject + "\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n" + message.Body)
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	return smtp.SendMail(fmt.Sprintf("%s:%d", s.Host, s.Port), auth, s.FromAddress, []string{message.To}, body)
}
