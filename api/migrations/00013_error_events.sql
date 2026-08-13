-- +goose Up
CREATE TABLE error_events (
    id uuid PRIMARY KEY,
    source text NOT NULL CHECK (source IN ('frontend', 'backend')),
    kind text NOT NULL CHECK (kind IN ('uncaught_error', 'unhandled_rejection', 'react_error', 'api_error', 'http_5xx', 'panic')),
    user_id uuid REFERENCES users(id) ON DELETE SET NULL,
    occurred_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    error_name text NOT NULL DEFAULT '' CHECK (char_length(error_name) <= 128),
    message text NOT NULL CHECK (char_length(trim(message)) BETWEEN 1 AND 4000),
    stack_trace text CHECK (stack_trace IS NULL OR char_length(stack_trace) <= 16000),
    component_stack text CHECK (component_stack IS NULL OR char_length(component_stack) <= 16000),
    page_path text NOT NULL DEFAULT '' CHECK (char_length(page_path) <= 512),
    request_method text CHECK (request_method IS NULL OR char_length(request_method) <= 16),
    request_path text CHECK (request_path IS NULL OR char_length(request_path) <= 512),
    request_id text CHECK (request_id IS NULL OR char_length(request_id) <= 128),
    status_code integer CHECK (status_code IS NULL OR status_code BETWEEN 100 AND 599),
    app_version text CHECK (app_version IS NULL OR char_length(app_version) <= 128),
    locale text CHECK (locale IS NULL OR char_length(locale) <= 64),
    time_zone text CHECK (time_zone IS NULL OR char_length(time_zone) <= 128),
    viewport_width integer CHECK (viewport_width IS NULL OR viewport_width BETWEEN 0 AND 10000),
    viewport_height integer CHECK (viewport_height IS NULL OR viewport_height BETWEEN 0 AND 10000),
    online boolean,
    user_agent text CHECK (user_agent IS NULL OR char_length(user_agent) <= 1024)
);

CREATE INDEX error_events_created_idx ON error_events (created_at DESC);
CREATE INDEX error_events_user_idx ON error_events (user_id, created_at DESC);
CREATE INDEX error_events_source_kind_idx ON error_events (source, kind, created_at DESC);
CREATE INDEX error_events_request_id_idx ON error_events (request_id) WHERE request_id IS NOT NULL;

-- +goose Down
DROP TABLE error_events;
