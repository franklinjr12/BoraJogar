package notification

import (
	"context"
	"fmt"
	"net/url"
	"strings"

	"github.com/google/uuid"
)

const (
	defaultEmailBatchSize      = 20
	maxEmailDeliveryAttempts   = 5
	maxDeliveryErrorMessageLen = 1000
)

type DeliveryRunResult struct {
	Claimed, Delivered, Retried, Failed int
}

const emailPreferencePredicate = `
	COALESCE(p.email_enabled, TRUE)
	AND CASE
		WHEN e.type IN ('match_proposal', 'proposal_confirmed', 'proposal_expired') THEN COALESCE(p.proposal_notifications, TRUE)
		WHEN e.type = 'game_reminder' THEN COALESCE(p.reminder_notifications, TRUE)
		ELSE COALESCE(p.game_update_notifications, TRUE)
	END`

// DeliverPendingEmail claims and sends a bounded batch. Claiming happens in a
// short transaction, so multiple workers cannot send the same delivery.
func (s Service) DeliverPendingEmail(ctx context.Context, baseURL string, batchSize int) (DeliveryRunResult, error) {
	if s.DB == nil {
		return DeliveryRunResult{}, fmt.Errorf("notification database unavailable")
	}
	if s.Channels == nil || s.Channels["email"] == nil {
		return DeliveryRunResult{}, fmt.Errorf("email notification channel unavailable")
	}
	if batchSize < 1 {
		batchSize = defaultEmailBatchSize
	}

	if err := s.disableIneligibleEmailDeliveries(ctx); err != nil {
		return DeliveryRunResult{}, err
	}
	deliveries, err := s.claimEmailDeliveries(ctx, batchSize)
	if err != nil {
		return DeliveryRunResult{}, err
	}
	result := DeliveryRunResult{Claimed: len(deliveries)}
	for _, delivery := range deliveries {
		delivery.ActionURL = absoluteActionURL(baseURL, delivery.ActionURL)
		if err := s.Deliver(ctx, delivery); err != nil {
			if failureErr := s.markEmailDeliveryFailure(ctx, delivery, err); failureErr != nil {
				return result, failureErr
			}
			if delivery.AttemptCount >= maxEmailDeliveryAttempts {
				result.Failed++
			} else {
				result.Retried++
			}
			continue
		}
		if err := s.markEmailDeliveryDelivered(ctx, delivery.ID); err != nil {
			return result, err
		}
		result.Delivered++
	}
	return result, nil
}

func (s Service) disableIneligibleEmailDeliveries(ctx context.Context) error {
	_, err := s.DB.Exec(ctx, `
		UPDATE notification_deliveries AS d
		SET status = 'disabled', last_attempt_at = now(), error_message = 'email delivery disabled by user or account status'
		FROM notification_events AS e
		JOIN users AS u ON u.id = e.user_id
		LEFT JOIN notification_preferences AS p ON p.user_id = u.id
		WHERE d.notification_event_id = e.id
		  AND d.channel = 'email'
		  AND d.status = 'pending'
		  AND (u.status <> 'active' OR u.deleted_at IS NOT NULL OR NOT (`+emailPreferencePredicate+`))`)
	return err
}

func (s Service) claimEmailDeliveries(ctx context.Context, batchSize int) ([]Delivery, error) {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback(ctx)

	rows, err := tx.Query(ctx, `
		SELECT d.id
		FROM notification_deliveries AS d
		JOIN notification_events AS e ON e.id = d.notification_event_id
		JOIN users AS u ON u.id = e.user_id
		LEFT JOIN notification_preferences AS p ON p.user_id = u.id
		WHERE d.channel = 'email'
		  AND u.status = 'active'
		  AND u.deleted_at IS NULL
		  AND (`+emailPreferencePredicate+`)
		  AND d.attempt_count < $1
		  AND (
			(d.status = 'pending' AND (d.last_attempt_at IS NULL OR now() >= d.last_attempt_at + CASE
				WHEN d.attempt_count <= 1 THEN interval '1 minute'
				WHEN d.attempt_count = 2 THEN interval '5 minutes'
				WHEN d.attempt_count = 3 THEN interval '15 minutes'
				ELSE interval '1 hour'
			END))
			OR (d.status = 'processing' AND d.last_attempt_at <= now() - interval '10 minutes')
		  )
		ORDER BY e.created_at ASC, d.id ASC
		LIMIT $2
		FOR UPDATE OF d SKIP LOCKED`, maxEmailDeliveryAttempts, batchSize)
	if err != nil {
		return nil, err
	}
	ids := make([]uuid.UUID, 0, batchSize)
	for rows.Next() {
		var id uuid.UUID
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	if len(ids) == 0 {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return []Delivery{}, nil
	}

	if _, err := tx.Exec(ctx, `UPDATE notification_deliveries SET status='processing',last_attempt_at=now(),attempt_count=attempt_count+1 WHERE id=ANY($1)`, ids); err != nil {
		return nil, err
	}
	rows, err = tx.Query(ctx, `
		SELECT d.id, d.notification_event_id, e.user_id, d.channel, d.status, d.attempt_count,
		       u.email, e.title, e.body, COALESCE(e.action_url, ''), e.payload
		FROM notification_deliveries AS d
		JOIN notification_events AS e ON e.id = d.notification_event_id
		JOIN users AS u ON u.id = e.user_id
		WHERE d.id = ANY($1)
		ORDER BY e.created_at ASC, d.id ASC`, ids)
	if err != nil {
		return nil, err
	}
	deliveries := make([]Delivery, 0, len(ids))
	for rows.Next() {
		var delivery Delivery
		if err := rows.Scan(&delivery.ID, &delivery.EventID, &delivery.UserID, &delivery.Channel, &delivery.Status, &delivery.AttemptCount, &delivery.To, &delivery.Title, &delivery.Body, &delivery.ActionURL, &delivery.Payload); err != nil {
			rows.Close()
			return nil, err
		}
		deliveries = append(deliveries, delivery)
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return nil, err
	}
	rows.Close()
	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return deliveries, nil
}

func (s Service) markEmailDeliveryDelivered(ctx context.Context, id uuid.UUID) error {
	result, err := s.DB.Exec(ctx, `UPDATE notification_deliveries SET status='delivered',delivered_at=now(),error_message=NULL WHERE id=$1 AND channel='email' AND status='processing'`, id)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("email delivery %s was not marked delivered", id)
	}
	return nil
}

func (s Service) markEmailDeliveryFailure(ctx context.Context, delivery Delivery, deliveryErr error) error {
	status := "pending"
	if delivery.AttemptCount >= maxEmailDeliveryAttempts {
		status = "failed"
	}
	message := truncateDeliveryError(deliveryErr.Error())
	result, err := s.DB.Exec(ctx, `UPDATE notification_deliveries SET status=$2,error_message=$3 WHERE id=$1 AND channel='email' AND status='processing'`, delivery.ID, status, message)
	if err != nil {
		return err
	}
	if result.RowsAffected() != 1 {
		return fmt.Errorf("email delivery %s was not marked %s", delivery.ID, status)
	}
	return nil
}

func truncateDeliveryError(message string) string {
	if len(message) <= maxDeliveryErrorMessageLen {
		return message
	}
	return message[:maxDeliveryErrorMessageLen]
}

func absoluteActionURL(baseURL, actionURL string) string {
	actionURL = strings.TrimSpace(actionURL)
	if actionURL == "" {
		return ""
	}
	parsedAction, err := url.Parse(actionURL)
	if err != nil {
		return ""
	}
	if parsedAction.IsAbs() {
		return parsedAction.String()
	}
	parsedBase, err := url.Parse(strings.TrimRight(strings.TrimSpace(baseURL), "/") + "/")
	if err != nil || parsedBase.Scheme == "" || parsedBase.Host == "" {
		return actionURL
	}
	return parsedBase.ResolveReference(parsedAction).String()
}
