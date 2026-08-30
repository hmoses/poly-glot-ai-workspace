-- 002_analytics_expansion.sql
-- Poly-Glot Analytics Expansion — additive only
-- DO NOT drop, truncate, rename, or destructively modify mcp_usage_events

-- 1. mcp_users — one summary row per stable hashed user
CREATE TABLE IF NOT EXISTS mcp_users (
    user_key       TEXT PRIMARY KEY,
    first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    first_client   TEXT,
    latest_client  TEXT,
    current_entitlement_state TEXT,
    total_calls    BIGINT NOT NULL DEFAULT 0
);

-- 2. mcp_sessions — one summary row per hashed session
CREATE TABLE IF NOT EXISTS mcp_sessions (
    session_key    TEXT PRIMARY KEY,
    user_key       TEXT,
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
    client_name    TEXT,
    authenticated  BOOLEAN,
    tool_calls     BIGINT NOT NULL DEFAULT 0
);

-- 3. subscription_events — append-only entitlement lifecycle
CREATE TABLE IF NOT EXISTS subscription_events (
    id                BIGSERIAL PRIMARY KEY,
    occurred_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_key          TEXT,
    event_type        TEXT NOT NULL,
    entitlement_state TEXT,
    product_id        TEXT,
    source            TEXT,
    client_name       TEXT,
    metadata          JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- 4. conversion_events — append-only funnel milestones
CREATE TABLE IF NOT EXISTS conversion_events (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    user_key       TEXT,
    session_key    TEXT,
    event_type     TEXT NOT NULL,
    client_name    TEXT,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Deduplicate first_* milestones per user
CREATE UNIQUE INDEX IF NOT EXISTS idx_conversion_user_event
ON conversion_events (user_key, event_type)
WHERE user_key IS NOT NULL;

-- 5. mcp_daily_metrics — pre-aggregated dashboard data
CREATE TABLE IF NOT EXISTS mcp_daily_metrics (
    metric_date     DATE NOT NULL,
    dimension_type  TEXT NOT NULL,
    dimension_value TEXT NOT NULL,
    total_calls     BIGINT NOT NULL DEFAULT 0,
    unique_users    BIGINT NOT NULL DEFAULT 0,
    unique_sessions BIGINT NOT NULL DEFAULT 0,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (metric_date, dimension_type, dimension_value)
);

-- 6. mcp_errors — sanitized operational analytics
CREATE TABLE IF NOT EXISTS mcp_errors (
    id             BIGSERIAL PRIMARY KEY,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    tool_name      TEXT,
    error_type     TEXT,
    client_name    TEXT,
    user_key       TEXT,
    session_key    TEXT,
    metadata       JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes on mcp_usage_events (only add missing ones)
CREATE INDEX IF NOT EXISTS idx_mcp_usage_client_name
ON mcp_usage_events (client_name);

-- Indexes on new tables
CREATE INDEX IF NOT EXISTS idx_mcp_sessions_user_key
ON mcp_sessions (user_key);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_key
ON subscription_events (user_key);

CREATE INDEX IF NOT EXISTS idx_subscription_events_occurred_at
ON subscription_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversion_events_user_key
ON conversion_events (user_key);

CREATE INDEX IF NOT EXISTS idx_conversion_events_occurred_at
ON conversion_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_errors_occurred_at
ON mcp_errors (occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_mcp_errors_tool_name
ON mcp_errors (tool_name);
