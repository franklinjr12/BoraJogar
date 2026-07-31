-- +goose Up
CREATE TABLE games (
    id uuid PRIMARY KEY,
    source_type text NOT NULL CHECK (source_type IN ('manual', 'automatic')),
    source_proposal_id uuid,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    title text CHECK (title IS NULL OR char_length(trim(title)) BETWEEN 1 AND 120),
    description text CHECK (description IS NULL OR char_length(description) <= 2000),
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    venue_id uuid NOT NULL REFERENCES venues(id),
    capacity integer NOT NULL CHECK (capacity BETWEEN 2 AND 12),
    minimum_skill_level text NOT NULL CHECK (minimum_skill_level IN ('learning', 'beginner', 'intermediate', 'advanced', 'competitive')),
    maximum_skill_level text NOT NULL CHECK (maximum_skill_level IN ('learning', 'beginner', 'intermediate', 'advanced', 'competitive')),
    visibility text NOT NULL CHECK (visibility IN ('public', 'link-only', 'private')),
    status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled', 'completed')),
    share_token_hash text UNIQUE,
    cancelled_at timestamptz,
    cancellation_reason text CHECK (cancellation_reason IS NULL OR char_length(cancellation_reason) <= 500),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX games_schedule_idx ON games(starts_at, status);
CREATE INDEX games_creator_idx ON games(created_by_user_id, starts_at);

CREATE TABLE game_players (
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role IN ('organizer', 'player')),
    status text NOT NULL CHECK (status IN ('confirmed', 'cancelled', 'removed')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    cancelled_at timestamptz,
    attendance_status text CHECK (attendance_status IS NULL OR attendance_status IN ('unknown', 'attended', 'no_show')),
    invited_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    PRIMARY KEY (game_id, user_id)
);
CREATE INDEX game_players_user_idx ON game_players(user_id, status, joined_at);

CREATE TABLE game_invitations (
    id uuid PRIMARY KEY,
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    invited_user_id uuid REFERENCES users(id) ON DELETE CASCADE,
    invited_email text,
    invitation_token_hash text NOT NULL UNIQUE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (invited_user_id IS NOT NULL OR invited_email IS NOT NULL)
);

CREATE TABLE game_waitlist (
    game_id uuid NOT NULL REFERENCES games(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    position integer NOT NULL CHECK (position > 0),
    joined_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (game_id, user_id),
    UNIQUE (game_id, position)
);

-- +goose Down
DROP TABLE game_waitlist;
DROP TABLE game_invitations;
DROP TABLE game_players;
DROP TABLE games;
