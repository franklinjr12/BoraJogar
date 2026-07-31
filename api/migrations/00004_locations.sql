-- +goose Up
CREATE TABLE venues (
    id uuid PRIMARY KEY,
    name text NOT NULL CHECK (char_length(trim(name)) BETWEEN 2 AND 160),
    description text,
    address_label text,
    city text NOT NULL CHECK (char_length(trim(city)) BETWEEN 1 AND 120),
    location geography(Point, 4326) NOT NULL,
    lighting_status text NOT NULL DEFAULT 'unknown' CHECK (lighting_status IN ('unknown', 'no_lighting', 'has_lighting')),
    surface_type text NOT NULL DEFAULT 'unknown' CHECK (surface_type IN ('unknown', 'sand', 'grass', 'hard_court', 'other')),
    access_type text NOT NULL DEFAULT 'unknown' CHECK (access_type IN ('public', 'private', 'paid_entry', 'unknown')),
    active boolean NOT NULL DEFAULT false,
    created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    approved_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX venues_location_gist_idx ON venues USING GIST (location);
CREATE INDEX venues_active_city_idx ON venues (active, lower(city));

CREATE TABLE preferred_areas (
    id uuid PRIMARY KEY,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label text NOT NULL CHECK (char_length(trim(label)) BETWEEN 1 AND 120),
    center geography(Point, 4326) NOT NULL,
    radius_meters integer NOT NULL CHECK (radius_meters BETWEEN 500 AND 25000),
    priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
    active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX preferred_areas_center_gist_idx ON preferred_areas USING GIST (center);
CREATE INDEX preferred_areas_user_active_idx ON preferred_areas (user_id, active, priority);

CREATE TABLE user_favorite_venues (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
    priority integer NOT NULL DEFAULT 0 CHECK (priority >= 0),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, venue_id)
);

CREATE INDEX user_favorite_venues_order_idx ON user_favorite_venues (user_id, priority, created_at);

-- +goose Down
DROP TABLE user_favorite_venues;
DROP TABLE preferred_areas;
DROP TABLE venues;
