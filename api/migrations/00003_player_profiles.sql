-- +goose Up
ALTER TABLE users
    ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled', 'deleted')),
    ADD COLUMN onboarding_completed_at timestamptz,
    ADD COLUMN deleted_at timestamptz;

CREATE TABLE player_profiles (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    skill_level text NOT NULL CHECK (skill_level IN ('learning', 'beginner', 'intermediate', 'advanced', 'competitive')),
    bio text CHECK (char_length(bio) <= 280),
    preferred_game_duration_minutes integer NOT NULL DEFAULT 90 CHECK (preferred_game_duration_minutes IN (60, 90, 120)),
    minimum_notice_minutes integer NOT NULL DEFAULT 120 CHECK (minimum_notice_minutes BETWEEN 0 AND 10080),
    active_for_matchmaking boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE player_style_preferences (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    style text NOT NULL CHECK (style IN ('casual', 'competitive', 'training_focused', 'mixed')),
    PRIMARY KEY (user_id, style)
);

CREATE TABLE onboarding_progress (
    user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    current_step integer NOT NULL DEFAULT 0 CHECK (current_step BETWEEN 0 AND 8),
    completed_steps integer[] NOT NULL DEFAULT '{}',
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX player_profiles_matchmaking_idx ON player_profiles (active_for_matchmaking, skill_level);

-- +goose Down
DROP TABLE onboarding_progress;
DROP TABLE player_style_preferences;
DROP TABLE player_profiles;
ALTER TABLE users DROP COLUMN deleted_at, DROP COLUMN onboarding_completed_at, DROP COLUMN status;
