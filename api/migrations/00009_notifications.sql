-- +goose Up
CREATE TABLE notification_events (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL CHECK (type IN ('welcome', 'match_proposal', 'proposal_confirmed', 'proposal_expired', 'manual_game_invitation', 'user_joined_game', 'user_left_game', 'waitlist_promotion', 'game_changed', 'game_cancelled', 'game_reminder', 'report_received')),
    title text NOT NULL CHECK (char_length(trim(title)) BETWEEN 1 AND 200),
    body text NOT NULL CHECK (char_length(trim(body)) BETWEEN 1 AND 2000),
    action_url text,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX notification_events_user_created_idx ON notification_events(user_id, created_at DESC, id DESC);
CREATE INDEX notification_events_unread_idx ON notification_events(user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE notification_deliveries (
    id uuid PRIMARY KEY,
    notification_event_id uuid NOT NULL REFERENCES notification_events(id) ON DELETE CASCADE,
    channel text NOT NULL CHECK (channel IN ('in_app', 'email', 'web_push')),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'delivered', 'failed', 'disabled')),
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    last_attempt_at timestamptz,
    delivered_at timestamptz,
    error_message text,
    UNIQUE(notification_event_id, channel)
);
CREATE INDEX notification_deliveries_pending_idx ON notification_deliveries(status, last_attempt_at);

CREATE TABLE notification_preferences (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    in_app_enabled boolean NOT NULL DEFAULT true,
    email_enabled boolean NOT NULL DEFAULT true,
    web_push_enabled boolean NOT NULL DEFAULT true,
    proposal_notifications boolean NOT NULL DEFAULT true,
    game_update_notifications boolean NOT NULL DEFAULT true,
    reminder_notifications boolean NOT NULL DEFAULT true,
    open_slot_notifications boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE push_subscriptions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    endpoint_hash text NOT NULL,
    endpoint_encrypted text NOT NULL,
    p256dh_encrypted text NOT NULL,
    auth_encrypted text NOT NULL,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_success_at timestamptz,
    disabled_at timestamptz,
    UNIQUE(user_id, endpoint_hash)
);
CREATE INDEX push_subscriptions_active_idx ON push_subscriptions(user_id) WHERE disabled_at IS NULL;

-- +goose Down
DROP TABLE push_subscriptions;
DROP TABLE notification_preferences;
DROP TABLE notification_deliveries;
DROP TABLE notification_events;
