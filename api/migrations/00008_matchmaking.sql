-- +goose Up
CREATE TABLE matchmaking_runs (
    id uuid PRIMARY KEY,
    started_at timestamptz NOT NULL,
    completed_at timestamptz,
    status text NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
    candidate_slot_count integer NOT NULL DEFAULT 0 CHECK (candidate_slot_count >= 0),
    proposal_count integer NOT NULL DEFAULT 0 CHECK (proposal_count >= 0),
    error_summary jsonb,
    configuration_snapshot jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE match_proposals (
    id uuid PRIMARY KEY,
    matchmaking_run_id uuid NOT NULL REFERENCES matchmaking_runs(id) ON DELETE RESTRICT,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE RESTRICT,
    required_player_count integer NOT NULL CHECK (required_player_count BETWEEN 2 AND 12),
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled')),
    expires_at timestamptz NOT NULL,
    confirmed_game_id uuid REFERENCES games(id) ON DELETE SET NULL,
    score_summary jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_proposals_user_time_idx ON match_proposals(starts_at, status);
CREATE UNIQUE INDEX match_proposals_pending_slot_venue_idx ON match_proposals(starts_at, venue_id) WHERE status = 'pending';

CREATE TABLE proposal_participants (
    proposal_id uuid NOT NULL REFERENCES match_proposals(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response_status text NOT NULL DEFAULT 'pending' CHECK (response_status IN ('pending', 'accepted', 'declined', 'expired')),
    proposed_at timestamptz NOT NULL DEFAULT now(),
    notified_at timestamptz,
    responded_at timestamptz,
    PRIMARY KEY (proposal_id, user_id)
);
CREATE INDEX proposal_participants_user_idx ON proposal_participants(user_id, response_status);

-- +goose Down
DROP TABLE proposal_participants;
DROP TABLE match_proposals;
DROP TABLE matchmaking_runs;
