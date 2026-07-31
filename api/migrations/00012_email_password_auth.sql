-- +goose Up
ALTER TABLE users
    ALTER COLUMN google_subject DROP NOT NULL,
    ADD COLUMN password_hash text;

CREATE UNIQUE INDEX users_email_lower_unique_idx ON users (lower(email));

ALTER TABLE users
    ADD CONSTRAINT users_auth_method_present CHECK (google_subject IS NOT NULL OR password_hash IS NOT NULL);

-- +goose Down
ALTER TABLE users DROP CONSTRAINT users_auth_method_present;
DROP INDEX users_email_lower_unique_idx;
DELETE FROM users WHERE google_subject IS NULL;
ALTER TABLE users
    DROP COLUMN password_hash,
    ALTER COLUMN google_subject SET NOT NULL;
