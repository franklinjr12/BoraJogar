package email

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"mime/multipart"
	"net/smtp"
	"net/textproto"
	"strings"
)

type Message struct {
	To, Subject, Body, HTMLBody string
	Headers                     map[string]string
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
	contentType := "text/plain; charset=UTF-8"
	body, boundary, err := renderBody(message)
	if err != nil {
		return err
	}
	if message.HTMLBody != "" {
		contentType = "multipart/alternative; boundary=\"" + boundary + "\""
	}
	fmt.Fprintf(&headers, "From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: %s\r\n", from, message.To, message.Subject, contentType)
	for name, value := range message.Headers {
		fmt.Fprintf(&headers, "%s: %s\r\n", name, value)
	}
	body = append([]byte(headers.String()+"\r\n"), body...)
	var auth smtp.Auth
	if s.Username != "" {
		auth = smtp.PlainAuth("", s.Username, s.Password, s.Host)
	}
	return smtp.SendMail(fmt.Sprintf("%s:%d", s.Host, s.Port), auth, s.FromAddress, []string{message.To}, body)
}

func renderBody(message Message) ([]byte, string, error) {
	if message.HTMLBody == "" {
		return []byte(message.Body), "", nil
	}
	var body bytes.Buffer
	writer := multipart.NewWriter(&body)
	boundary := writer.Boundary()
	plainPart, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Type":              {"text/plain; charset=UTF-8"},
		"Content-Transfer-Encoding": {"8bit"},
	})
	if err != nil {
		return nil, "", err
	}
	if _, err := plainPart.Write([]byte(message.Body)); err != nil {
		return nil, "", err
	}
	htmlPart, err := writer.CreatePart(textproto.MIMEHeader{
		"Content-Type":              {"text/html; charset=UTF-8"},
		"Content-Transfer-Encoding": {"8bit"},
	})
	if err != nil {
		return nil, "", err
	}
	if _, err := htmlPart.Write([]byte(message.HTMLBody)); err != nil {
		return nil, "", err
	}
	if err := writer.Close(); err != nil {
		return nil, "", err
	}
	return body.Bytes(), boundary, nil
}
