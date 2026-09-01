package game

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/borajogar/borajogar/api/internal/notification"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type dueConfirmationNotification struct {
	GameID    uuid.UUID
	UserID    uuid.UUID
	StartsAt  time.Time
	GameTitle string
}

func SendDueConfirmationNotifications(ctx context.Context, db *pgxpool.Pool, publisher notification.Publisher, now time.Time) (int, error) {
	if db == nil {
		return 0, errors.New("game confirmation database unavailable")
	}
	if publisher == nil {
		return 0, errors.New("game confirmation notification publisher unavailable")
	}
	now = now.UTC()
	rows, err := db.Query(ctx, `SELECT g.id,gp.user_id,g.starts_at,COALESCE(g.title,'') FROM games AS g JOIN game_players AS gp ON gp.game_id=g.id AND gp.status='confirmed' JOIN users AS u ON u.id=gp.user_id AND u.status='active' AND u.deleted_at IS NULL WHERE g.confirmation_enabled AND g.status='scheduled' AND g.starts_at > $1 AND g.starts_at <= $1 + interval '24 hours' ORDER BY g.starts_at,g.id,gp.joined_at,gp.user_id`, now)
	if err != nil {
		return 0, err
	}
	defer rows.Close()
	items := []dueConfirmationNotification{}
	for rows.Next() {
		var item dueConfirmationNotification
		if err := rows.Scan(&item.GameID, &item.UserID, &item.StartsAt, &item.GameTitle); err != nil {
			return 0, err
		}
		items = append(items, item)
	}
	if err := rows.Err(); err != nil {
		return 0, err
	}

	created := 0
	var firstErr error
	for _, item := range items {
		name := strings.TrimSpace(item.GameTitle)
		if name == "" {
			name = "Partida de vôlei de praia"
		}
		if !now.Before(item.StartsAt.Add(-24 * time.Hour)) {
			if err := publishDueNotification(ctx, db, publisher, item.GameID, notification.EventInput{
				UserID:    item.UserID,
				Type:      notification.MatchConfirmation,
				Title:     "Confirme sua presença",
				Body:      "Confirme sua presença na partida " + name + ".",
				ActionURL: "/games/" + item.GameID.String(),
				Payload:   map[string]string{"gameId": item.GameID.String()},
				Channels:  []string{"in_app", "email"},
				DedupeKey: "game-confirmation:" + item.GameID.String() + ":" + item.UserID.String(),
			}); err != nil {
				if firstErr == nil {
					firstErr = err
				}
			} else {
				created++
			}
		}
		if !now.Before(item.StartsAt.Add(-time.Hour)) {
			if err := publishDueNotification(ctx, db, publisher, item.GameID, notification.EventInput{
				UserID:    item.UserID,
				Type:      notification.GameReminder,
				Title:     "Lembrete de partida",
				Body:      "Sua partida " + name + " começa em 1 hora.",
				ActionURL: "/games/" + item.GameID.String(),
				Payload:   map[string]string{"gameId": item.GameID.String()},
				Channels:  []string{"in_app", "email"},
				DedupeKey: "game-reminder:" + item.GameID.String() + ":" + item.UserID.String(),
			}); err != nil {
				if firstErr == nil {
					firstErr = err
				}
			} else {
				created++
			}
		}
	}
	return created, firstErr
}

func publishDueNotification(ctx context.Context, db *pgxpool.Pool, publisher notification.Publisher, gameID uuid.UUID, input notification.EventInput) error {
	transactional, ok := publisher.(notification.TransactionalPublisher)
	if !ok {
		return publisher.Publish(ctx, input)
	}
	tx, err := db.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	var status string
	if err := tx.QueryRow(ctx, `SELECT status FROM games WHERE id=$1 FOR SHARE`, gameID).Scan(&status); errors.Is(err, pgx.ErrNoRows) {
		return tx.Commit(ctx)
	} else if err != nil {
		return err
	}
	if status != "scheduled" {
		return tx.Commit(ctx)
	}
	if err := transactional.PublishInTransaction(ctx, tx, input); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
