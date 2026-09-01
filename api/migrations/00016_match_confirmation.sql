-- +goose Up
ALTER TABLE games
    ADD COLUMN confirmation_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE game_players
    ADD COLUMN confirmation_confirmed boolean NOT NULL DEFAULT false,
    ADD COLUMN confirmation_at timestamptz;

CREATE INDEX games_confirmation_schedule_idx
    ON games(starts_at)
    WHERE confirmation_enabled AND status = 'scheduled';
CREATE INDEX game_players_confirmation_game_idx
    ON game_players(game_id, user_id)
    WHERE status = 'confirmed';

ALTER TABLE notification_events
    ADD COLUMN dedupe_key text;
CREATE UNIQUE INDEX notification_events_dedupe_key_idx
    ON notification_events(dedupe_key);

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'waitlist_open', 'game_changed', 'game_cancelled',
    'game_reminder', 'match_confirmation', 'report_received',
    'attendance_requested', 'game_chat_message'
));

-- +goose Down
-- Reminder events are feature-specific and cannot satisfy the previous type constraint.
DELETE FROM notification_events WHERE type = 'match_confirmation';

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'waitlist_open', 'game_changed', 'game_cancelled',
    'game_reminder', 'report_received', 'attendance_requested', 'game_chat_message'
));

DROP INDEX notification_events_dedupe_key_idx;
ALTER TABLE notification_events DROP COLUMN dedupe_key;
DROP INDEX game_players_confirmation_game_idx;
DROP INDEX games_confirmation_schedule_idx;
ALTER TABLE game_players DROP COLUMN confirmation_at, DROP COLUMN confirmation_confirmed;
ALTER TABLE games DROP COLUMN confirmation_enabled;
