-- PostgreSQL migration. Apply once to your existing T.O. database.
-- This initial version is for PERSONAL projects. Organization/team RBAC comes later.
CREATE TABLE IF NOT EXISTS to_monitor_projects (
  id UUID PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name VARCHAR(80) NOT NULL,
  runtime VARCHAR(24) NOT NULL DEFAULT 'nodejs',
  environment VARCHAR(24) NOT NULL DEFAULT 'development',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS to_monitor_projects_owner_idx ON to_monitor_projects(owner_user_id);

CREATE TABLE IF NOT EXISTS to_monitor_keys (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES to_monitor_projects(id) ON DELETE CASCADE,
  key_hash CHAR(64) NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS to_monitor_keys_project_idx ON to_monitor_keys(project_id);

CREATE TABLE IF NOT EXISTS to_monitor_spans (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES to_monitor_projects(id) ON DELETE CASCADE,
  service_name VARCHAR(100) NOT NULL,
  operation VARCHAR(180) NOT NULL,
  trace_id TEXT,
  span_id TEXT,
  http_method VARCHAR(20),
  http_route VARCHAR(180),
  http_status INTEGER,
  duration_ms DOUBLE PRECISION,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS to_monitor_spans_project_time_idx ON to_monitor_spans(project_id,received_at DESC);
