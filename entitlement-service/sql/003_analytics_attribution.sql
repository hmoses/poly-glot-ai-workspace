-- 003_analytics_attribution.sql
-- Additive analytics attribution migration. Preserves all existing data.
-- Adds traffic classification, client attribution, and request-level telemetry.

-- Extend mcp_usage_events with attribution columns
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS traffic_class text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS reported_client_name text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS reported_client_version text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS referer_host text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS origin_host text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS request_key text;
ALTER TABLE mcp_usage_events ADD COLUMN IF NOT EXISTS analytics_version text;

CREATE INDEX IF NOT EXISTS idx_mcp_usage_traffic_class ON mcp_usage_events (traffic_class);
CREATE INDEX IF NOT EXISTS idx_mcp_usage_request_key ON mcp_usage_events (request_key);

-- Optional request-level telemetry. No raw headers, IPs, URLs, prompts, or secrets.
CREATE TABLE IF NOT EXISTS mcp_request_events (
  id bigserial PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  request_key text,
  event_type text NOT NULL,
  method text,
  path text,
  traffic_class text,
  client_name text,
  reported_client_name text,
  reported_client_version text,
  authenticated boolean NOT NULL DEFAULT false,
  referer_host text,
  origin_host text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS idx_mcp_request_events_time ON mcp_request_events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_request_events_class ON mcp_request_events (traffic_class);
CREATE INDEX IF NOT EXISTS idx_mcp_request_events_request ON mcp_request_events (request_key);
