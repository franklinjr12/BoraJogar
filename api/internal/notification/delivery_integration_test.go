//go:build integration

package notification

import (
	"context"
	"os"
	"strings"
	"testing"

	"github.com/borajogar/borajogar/api/internal/platform/email"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func integrationNotificationDB(t *testing.T) *pgxpool.Pool {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL is required for integration tests")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	if err := db.Ping(context.Background()); err != nil {
		db.Close()
		t.Fatal(err)
	}
	return db
}

func TestDeliverPendingEmailIntegration(t *testing.T) {
	db := integrationNotificationDB(t)
	defer db.Close()
	ctx := context.Background()
	userID := uuid.New()
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) })
	if _, err := db.Exec(ctx, `INSERT INTO users (id, google_subject, email, display_name) VALUES ($1,$2,$3,$4)`, userID, "notification-delivery-"+userID.String(), "delivery-"+userID.String()+"@example.com", "Delivery Test"); err != nil {
		t.Fatal(err)
	}

	sender := &recordingEmailSender{}
	service := Service{DB: db, Channels: map[string]NotificationChannel{"email": EmailChannel{Sender: sender}}}
	if err := service.Publish(ctx, EventInput{UserID: userID, Type: MatchProposal, Title: "New proposal", Body: "Review proposal.", ActionURL: "/proposals/123", Payload: map[string]string{"proposalId": "123"}}); err != nil {
		t.Fatal(err)
	}

	result, err := service.DeliverPendingEmail(ctx, "https://borajogar.example", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Claimed != 1 || result.Delivered != 1 {
		t.Fatalf("result = %+v", result)
	}
	if len(sender.messages) != 1 || sender.messages[0].To != "delivery-"+userID.String()+"@example.com" || !strings.Contains(sender.messages[0].Body, "https://borajogar.example/proposals/123") {
		t.Fatalf("messages = %+v", sender.messages)
	}

	var status string
	var attempts int
	if err := db.QueryRow(ctx, `SELECT d.status,d.attempt_count FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.user_id=$1 AND d.channel='email'`, userID).Scan(&status, &attempts); err != nil {
		t.Fatal(err)
	}
	if status != "delivered" || attempts != 1 {
		t.Fatalf("status=%s attempts=%d", status, attempts)
	}
}

func TestPublishWithSelectedChannelsCreatesOnlyThoseDeliveriesIntegration(t *testing.T) {
	db := integrationNotificationDB(t)
	defer db.Close()
	ctx := context.Background()
	userID := uuid.New()
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) })
	if _, err := db.Exec(ctx, `INSERT INTO users (id, google_subject, email, display_name) VALUES ($1,$2,$3,$4)`, userID, "notification-chat-"+userID.String(), "chat-"+userID.String()+"@example.com", "Chat Test"); err != nil {
		t.Fatal(err)
	}

	service := Service{DB: db}
	if err := service.Publish(ctx, EventInput{
		UserID:   userID,
		Type:     GameChatMessage,
		Title:    "Nova mensagem na partida",
		Body:     "Uma nova mensagem foi enviada no chat da sua partida.",
		Channels: []string{"in_app"},
	}); err != nil {
		t.Fatal(err)
	}

	var channels []string
	rows, err := db.Query(ctx, `SELECT d.channel FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.user_id=$1 ORDER BY d.channel`, userID)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var channel string
		if err := rows.Scan(&channel); err != nil {
			rows.Close()
			t.Fatal(err)
		}
		channels = append(channels, channel)
	}
	rows.Close()
	if len(channels) != 1 || channels[0] != "in_app" {
		t.Fatalf("channels = %v", channels)
	}
}

func TestDeliverPendingEmailDisablesOptedOutDeliveryIntegration(t *testing.T) {
	db := integrationNotificationDB(t)
	defer db.Close()
	ctx := context.Background()
	userID := uuid.New()
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) })
	if _, err := db.Exec(ctx, `INSERT INTO users (id, google_subject, email, display_name) VALUES ($1,$2,$3,$4)`, userID, "notification-optout-"+userID.String(), "optout-"+userID.String()+"@example.com", "Opt Out"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO notification_preferences (user_id, email_enabled, proposal_notifications) VALUES ($1,false,false)`, userID); err != nil {
		t.Fatal(err)
	}
	service := Service{DB: db, Channels: map[string]NotificationChannel{"email": EmailChannel{Sender: &recordingEmailSender{}}}}
	if err := service.Publish(ctx, EventInput{UserID: userID, Type: MatchProposal, Title: "New proposal", Body: "Review proposal."}); err != nil {
		t.Fatal(err)
	}

	result, err := service.DeliverPendingEmail(ctx, "https://borajogar.example", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Claimed != 0 {
		t.Fatalf("result = %+v", result)
	}
	var status string
	if err := db.QueryRow(ctx, `SELECT d.status FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.user_id=$1 AND d.channel='email'`, userID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "disabled" {
		t.Fatalf("status = %q", status)
	}
}

func TestDeliverPendingEmailRespectsWaitlistOpenPreferenceIntegration(t *testing.T) {
	db := integrationNotificationDB(t)
	defer db.Close()
	ctx := context.Background()
	userID := uuid.New()
	t.Cleanup(func() { _, _ = db.Exec(ctx, `DELETE FROM users WHERE id=$1`, userID) })
	if _, err := db.Exec(ctx, `INSERT INTO users (id, google_subject, email, display_name) VALUES ($1,$2,$3,$4)`, userID, "notification-waitlist-"+userID.String(), "waitlist-"+userID.String()+"@example.com", "Waitlist Test"); err != nil {
		t.Fatal(err)
	}
	if _, err := db.Exec(ctx, `INSERT INTO notification_preferences (user_id, open_slot_notifications) VALUES ($1,false)`, userID); err != nil {
		t.Fatal(err)
	}
	service := Service{DB: db, Channels: map[string]NotificationChannel{"email": EmailChannel{Sender: &recordingEmailSender{}}}}
	if err := service.Publish(ctx, EventInput{UserID: userID, Type: WaitlistOpen, Title: "Vaga disponível", Body: "Uma vaga abriu."}); err != nil {
		t.Fatal(err)
	}

	result, err := service.DeliverPendingEmail(ctx, "https://borajogar.example", 10)
	if err != nil {
		t.Fatal(err)
	}
	if result.Claimed != 0 {
		t.Fatalf("result = %+v", result)
	}
	var status string
	if err := db.QueryRow(ctx, `SELECT d.status FROM notification_deliveries d JOIN notification_events e ON e.id=d.notification_event_id WHERE e.user_id=$1 AND d.channel='email'`, userID).Scan(&status); err != nil {
		t.Fatal(err)
	}
	if status != "disabled" {
		t.Fatalf("status = %q", status)
	}
}

var _ email.Sender = (*recordingEmailSender)(nil)
