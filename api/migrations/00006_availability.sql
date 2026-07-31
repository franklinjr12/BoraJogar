-- +goose Up
CREATE TABLE availability_rules (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    start_local_time time NOT NULL,
    end_local_time time NOT NULL CHECK (end_local_time > start_local_time),
    timezone text NOT NULL,
    valid_from date NOT NULL,
    valid_until date,
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CHECK (valid_until IS NULL OR valid_until >= valid_from)
);
CREATE INDEX availability_rules_user_idx ON availability_rules(user_id, active, weekday);

CREATE TABLE availability_rule_venues (
    availability_rule_id uuid NOT NULL REFERENCES availability_rules(id) ON DELETE CASCADE,
    venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    PRIMARY KEY (availability_rule_id, venue_id)
);

CREATE TABLE availability_rule_areas (
    availability_rule_id uuid NOT NULL REFERENCES availability_rules(id) ON DELETE CASCADE,
    preferred_area_id uuid NOT NULL REFERENCES preferred_areas(id) ON DELETE CASCADE,
    PRIMARY KEY (availability_rule_id, preferred_area_id)
);

CREATE TABLE availability_exceptions (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    exception_date date NOT NULL,
    exception_type text NOT NULL CHECK (exception_type IN ('unavailable_all_day', 'unavailable_interval', 'available_interval')),
    start_local_time time,
    end_local_time time,
    timezone text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK ((exception_type = 'unavailable_all_day' AND start_local_time IS NULL AND end_local_time IS NULL) OR
           (exception_type <> 'unavailable_all_day' AND start_local_time IS NOT NULL AND end_local_time IS NOT NULL AND end_local_time > start_local_time))
);
CREATE INDEX availability_exceptions_user_date_idx ON availability_exceptions(user_id, exception_date);

CREATE TABLE availability_occurrences (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    starts_at timestamptz NOT NULL,
    ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
    source_type text NOT NULL CHECK (source_type IN ('rule', 'exception')),
    source_id uuid NOT NULL,
    generated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, starts_at, ends_at, source_type, source_id)
);
CREATE INDEX availability_occurrences_user_time_idx ON availability_occurrences(user_id, starts_at, ends_at);

-- +goose Down
DROP TABLE availability_occurrences;
DROP TABLE availability_exceptions;
DROP TABLE availability_rule_areas;
DROP TABLE availability_rule_venues;
DROP TABLE availability_rules;
