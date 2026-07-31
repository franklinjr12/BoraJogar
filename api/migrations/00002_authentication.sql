-- +goose Up
CREATE TABLE users (
    id uuid PRIMARY KEY,
    google_subject text NOT NULL UNIQUE,
    email text NOT NULL,
    display_name text NOT NULL,
    avatar_url text,
    time_zone text NOT NULL DEFAULT 'UTC',
    onboarding_completed boolean NOT NULL DEFAULT false,
    is_admin boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE invitations (
    id uuid PRIMARY KEY,
    code_hash text NOT NULL UNIQUE,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    email text,
    max_uses integer NOT NULL DEFAULT 1 CHECK (max_uses > 0),
    current_uses integer NOT NULL DEFAULT 0 CHECK (current_uses >= 0),
    expires_at timestamptz,
    disabled_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT invitations_uses_valid CHECK (current_uses <= max_uses)
);

CREATE INDEX invitations_email_idx ON invitations (lower(email)) WHERE email IS NOT NULL;

CREATE TABLE sessions (
    token_hash text PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    user_agent text,
    ip_hash text
);

CREATE INDEX sessions_expiry_idx ON sessions (expires_at);
CREATE INDEX sessions_user_idx ON sessions (user_id);

-- +goose Down
DROP TABLE sessions;
DROP TABLE invitations;
DROP TABLE users;
