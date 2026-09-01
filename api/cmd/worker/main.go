package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/borajogar/borajogar/api/internal/attendance"
	"github.com/borajogar/borajogar/api/internal/auth"
	"github.com/borajogar/borajogar/api/internal/availability"
	"github.com/borajogar/borajogar/api/internal/game"
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/borajogar/borajogar/api/internal/platform/config"
	"github.com/borajogar/borajogar/api/internal/platform/database"
	"github.com/borajogar/borajogar/api/internal/platform/email"
)

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	cfg, err := config.Load()
	if err != nil {
		logger.Error("invalid configuration", "error", err)
		os.Exit(1)
	}
	logger = logger.With("environment", cfg.Environment)
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	notifications := notification.Service{
		DB: db,
		Channels: map[string]notification.NotificationChannel{
			"email": notification.EmailChannel{DefaultTimezone: cfg.DefaultTimezone, Sender: email.SMTP{
				Host:        cfg.SMTPHost,
				Port:        cfg.SMTPPort,
				Username:    cfg.SMTPUsername,
				Password:    cfg.SMTPPassword,
				FromAddress: cfg.SMTPFromAddress,
				FromName:    cfg.SMTPFromName,
			}},
		},
	}
	logger.Info("worker started")
	cleanup := func() {
		deleted, cleanupErr := auth.CleanupExpiredSessions(ctx, db)
		if cleanupErr != nil {
			logger.Error("session cleanup failed", "error", cleanupErr)
			return
		}
		logger.Info("expired sessions cleaned", "deleted", deleted)
	}
	cleanup()
	completeGames := func() {
		completed, completeErr := attendance.CompleteFinishedGames(ctx, db, notifications, time.Now().UTC(), 15*time.Minute)
		if completeErr != nil {
			logger.Error("finished game completion failed", "error", completeErr)
			return
		}
		if completed > 0 {
			logger.Info("finished games completed", "count", completed)
		}
	}
	deliverEmails := func() {
		result, deliveryErr := notifications.DeliverPendingEmail(ctx, cfg.BaseURL, 20)
		if deliveryErr != nil {
			logger.Error("email delivery run failed", "error", deliveryErr)
			return
		}
		if result.Claimed > 0 {
			logger.Info("email delivery run completed", "claimed", result.Claimed, "delivered", result.Delivered, "retried", result.Retried, "failed", result.Failed)
		}
	}
	sendConfirmationNotifications := func() {
		created, confirmationErr := game.SendDueConfirmationNotifications(ctx, db, notifications, time.Now().UTC())
		if confirmationErr != nil {
			logger.Error("game confirmation notification run failed", "error", confirmationErr)
			return
		}
		if created > 0 {
			logger.Info("game confirmation notification run completed", "created", created)
		}
	}
	completeGames()
	deliverEmails()
	sendConfirmationNotifications()
	if err := availability.ExpandFuture(ctx, db, time.Now().UTC()); err != nil {
		logger.Error("availability expansion failed", "error", err)
	}
	maintenanceTicker := time.NewTicker(time.Hour)
	defer maintenanceTicker.Stop()
	deliveryTicker := time.NewTicker(time.Minute)
	defer deliveryTicker.Stop()
	confirmationTicker := time.NewTicker(5 * time.Minute)
	defer confirmationTicker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-maintenanceTicker.C:
			cleanup()
			completeGames()
			if err := availability.ExpandFuture(ctx, db, time.Now().UTC()); err != nil {
				logger.Error("availability expansion failed", "error", err)
			}
		case <-deliveryTicker.C:
			deliverEmails()
		case <-confirmationTicker.C:
			sendConfirmationNotifications()
		}
	}
}
