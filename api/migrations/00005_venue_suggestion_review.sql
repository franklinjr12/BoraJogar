-- +goose Up
ALTER TABLE venues ADD COLUMN rejected_at timestamptz;

-- +goose Down
ALTER TABLE venues DROP COLUMN rejected_at;
