-- +goose Up
CREATE TABLE audit_events (
    id uuid PRIMARY KEY,
    actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    action text NOT NULL CHECK (action IN ('user_disabled','user_re_enabled','venue_approved','venue_rejected','proposal_cancelled_by_admin','report_resolved','invitation_created','invitation_disabled')),
    target_type text NOT NULL,
    target_id uuid NOT NULL,
    details jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_created_idx ON audit_events (created_at DESC);
CREATE INDEX audit_events_target_idx ON audit_events (target_type, target_id, created_at DESC);

-- +goose Down
DROP TABLE audit_events;
