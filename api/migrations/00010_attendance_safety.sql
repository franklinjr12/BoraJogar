-- +goose Up
ALTER TABLE users
    ADD COLUMN deletion_requested_at timestamptz,
    ADD COLUMN anonymized_at timestamptz;

ALTER TABLE games
    ADD COLUMN completed_at timestamptz,
    ADD COLUMN attendance_requested_at timestamptz,
    ADD COLUMN cancellation_threshold_minutes integer;

ALTER TABLE game_players
    ADD COLUMN attendance_recorded_at timestamptz,
    ADD COLUMN attendance_recorded_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    ADD COLUMN cancellation_type text CHECK (cancellation_type IS NULL OR cancellation_type IN ('early', 'late', 'no_show')),
    ADD COLUMN cancellation_threshold_minutes integer;

ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN ('welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired', 'manual_game_invitation', 'user_joined_game', 'user_left_game', 'waitlist_promotion', 'game_changed', 'game_cancelled', 'game_reminder', 'report_received', 'attendance_requested'));

CREATE TABLE user_blocks (
    blocker_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    blocked_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (blocker_user_id, blocked_user_id),
    CHECK (blocker_user_id <> blocked_user_id)
);
CREATE INDEX user_blocks_blocked_idx ON user_blocks(blocked_user_id, blocker_user_id);

CREATE TABLE reports (
    id uuid PRIMARY KEY,
    reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    game_id uuid REFERENCES games(id) ON DELETE SET NULL,
    category text NOT NULL CHECK (category IN ('harassment', 'unsafe_behavior', 'repeated_no_show', 'false_profile', 'inappropriate_content', 'other')),
    description text NOT NULL CHECK (char_length(trim(description)) BETWEEN 1 AND 2000),
    status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'investigating', 'resolved', 'dismissed')),
    created_at timestamptz NOT NULL DEFAULT now(),
    reviewed_at timestamptz,
    reviewed_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    resolution_notes text CHECK (resolution_notes IS NULL OR char_length(resolution_notes) <= 2000)
);
CREATE INDEX reports_status_created_idx ON reports(status, created_at DESC);
CREATE INDEX reports_reporter_idx ON reports(reporter_user_id, created_at DESC);

-- +goose Down
DROP TABLE reports;
DROP TABLE user_blocks;
ALTER TABLE notification_events DROP CONSTRAINT notification_events_type_check;
ALTER TABLE notification_events ADD CONSTRAINT notification_events_type_check CHECK (type IN ('welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired', 'manual_game_invitation', 'user_joined_game', 'user_left_game', 'waitlist_promotion', 'game_changed', 'game_cancelled', 'game_reminder', 'report_received'));
ALTER TABLE game_players DROP COLUMN cancellation_threshold_minutes, DROP COLUMN cancellation_type, DROP COLUMN attendance_recorded_by_user_id, DROP COLUMN attendance_recorded_at;
ALTER TABLE games DROP COLUMN cancellation_threshold_minutes, DROP COLUMN attendance_requested_at, DROP COLUMN completed_at;
ALTER TABLE users DROP COLUMN anonymized_at, DROP COLUMN deletion_requested_at;
