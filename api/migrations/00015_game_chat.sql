-- +goose Up
CREATE TABLE game_chat_messages (
    id uuid PRIMARY KEY,
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX game_chat_messages_game_created_idx
    ON game_chat_messages(game_id, created_at DESC, id DESC);

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'waitlist_open', 'game_changed', 'game_cancelled',
    'game_reminder', 'report_received', 'attendance_requested', 'game_chat_message'
));

-- +goose Down
DELETE FROM notification_deliveries
WHERE notification_event_id IN (
    SELECT id FROM notification_events WHERE type = 'game_chat_message'
);
DELETE FROM notification_events WHERE type = 'game_chat_message';

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN (
    'welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired',
    'manual_game_invitation', 'user_joined_game', 'user_left_game',
    'waitlist_promotion', 'waitlist_open', 'game_changed', 'game_cancelled',
    'game_reminder', 'report_received', 'attendance_requested'
));

DROP TABLE game_chat_messages;
