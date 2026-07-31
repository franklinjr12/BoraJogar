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
	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/borajogar/borajogar/api/internal/platform/config"
	"github.com/borajogar/borajogar/api/internal/platform/database"
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
	db, err := database.Open(ctx, cfg.DatabaseURL)
	if err != nil {
		logger.Error("database connection failed", "error", err)
		os.Exit(1)
	}
	defer db.Close()
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
		completed, completeErr := attendance.CompleteFinishedGames(ctx, db, notification.Service{DB: db}, time.Now().UTC(), 15*time.Minute)
		if completeErr != nil {
			logger.Error("finished game completion failed", "error", completeErr)
			return
		}
		if completed > 0 {
			logger.Info("finished games completed", "count", completed)
		}
	}
	completeGames()
	if err := availability.ExpandFuture(ctx, db, time.Now().UTC()); err != nil {
		logger.Error("availability expansion failed", "error", err)
	}
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			cleanup()
			completeGames()
			if err := availability.ExpandFuture(ctx, db, time.Now().UTC()); err != nil {
				logger.Error("availability expansion failed", "error", err)
			}
		}
	}
}
