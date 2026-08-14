-- +goose Up
ALTER TABLE games
    ADD COLUMN waitlist_enabled boolean NOT NULL DEFAULT false,
    ADD COLUMN waitlist_size integer NOT NULL DEFAULT 0,
    ADD CONSTRAINT games_waitlist_configuration_check CHECK (
        (waitlist_enabled AND waitlist_size > 0)
        OR (NOT waitlist_enabled AND waitlist_size = 0)
    );

-- Existing waitlist rows represent an explicit, already-used waitlist. Preserve
-- those queues while assigning their current size as the compatibility default.
UPDATE games AS g
SET waitlist_enabled = true,
    waitlist_size = queue.size
FROM (
    SELECT game_id, count(*)::integer AS size
    FROM game_waitlist
    GROUP BY game_id
) AS queue
WHERE g.id = queue.game_id;

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'waitlist_open', 'game_changed', 'game_cancelled',
    'game_reminder', 'report_received', 'attendance_requested'
));

-- +goose Down
ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'game_changed', 'game_cancelled', 'game_reminder',
    'report_received', 'attendance_requested'
));
ALTER TABLE games DROP CONSTRAINT games_waitlist_configuration_check;
ALTER TABLE games DROP COLUMN waitlist_size, DROP COLUMN waitlist_enabled;
