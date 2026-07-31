package main

import (
	"context"
	"fmt"
	"os"
	"strconv"

	"github.com/borajogar/borajogar/api/internal/platform/email"
)

func main() {
	port, err := strconv.Atoi(getenv("SMTP_PORT", "1025"))
	if err != nil {
		panic(err)
	}
	sender := email.SMTP{Host: getenv("SMTP_HOST", "localhost"), Port: port, Username: os.Getenv("SMTP_USERNAME"), Password: os.Getenv("SMTP_PASSWORD"), FromAddress: getenv("SMTP_FROM_ADDRESS", "no-reply@borajogar.local"), FromName: getenv("SMTP_FROM_NAME", "Bora Jogar")}
	if err := sender.Send(context.Background(), email.Message{To: getenv("TEST_EMAIL_TO", "inbox@borajogar.local"), Subject: "Bora Jogar test email", Body: "SMTP development delivery works."}); err != nil {
		panic(err)
	}
	fmt.Println("test email sent")
}
func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}
