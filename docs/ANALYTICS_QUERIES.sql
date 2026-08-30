-- Poly-Glot Analytics Dashboard Queries
-- READ ONLY

-- Overall dashboard
SELECT
  COUNT(*) AS total_calls,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS unique_users,
  COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS unique_sessions
FROM mcp_usage_events;

-- Last 24 hours
SELECT
  COUNT(*) AS calls_24h,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users_24h,
  COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS sessions_24h
FROM mcp_usage_events
WHERE occurred_at >= now() - interval '24 hours';

-- DAU
SELECT
  date_trunc('day', occurred_at) AS day,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS dau
FROM mcp_usage_events
WHERE occurred_at >= now() - interval '30 days'
GROUP BY 1
ORDER BY 1 DESC;

-- Approx current WAU
SELECT COUNT(DISTINCT user_key) AS wau
FROM mcp_usage_events
WHERE user_key IS NOT NULL
  AND occurred_at >= now() - interval '7 days';

-- Approx current MAU
SELECT COUNT(DISTINCT user_key) AS mau
FROM mcp_usage_events
WHERE user_key IS NOT NULL
  AND occurred_at >= now() - interval '30 days';

-- Tool usage
SELECT
  tool_name,
  COUNT(*) AS calls,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users,
  COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS sessions
FROM mcp_usage_events
GROUP BY tool_name
ORDER BY calls DESC;

-- Client usage
SELECT
  client_name,
  COUNT(*) AS calls,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users,
  COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS sessions
FROM mcp_usage_events
GROUP BY client_name
ORDER BY calls DESC;

-- User summaries
SELECT
  user_key,
  first_seen,
  last_seen,
  first_client,
  latest_client,
  current_entitlement_state,
  total_calls
FROM mcp_users
ORDER BY last_seen DESC
LIMIT 100;

-- Returning users (more than one recorded tool call)
SELECT COUNT(*) AS returning_users
FROM mcp_users
WHERE total_calls > 1;

-- Session summaries
SELECT
  session_key,
  user_key,
  started_at,
  last_seen,
  client_name,
  authenticated,
  tool_calls
FROM mcp_sessions
ORDER BY last_seen DESC
LIMIT 100;

-- Conversion funnel
SELECT
  event_type,
  COUNT(*) AS events,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users,
  COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS sessions
FROM conversion_events
GROUP BY event_type
ORDER BY events DESC;

-- Subscription lifecycle
SELECT
  event_type,
  entitlement_state,
  COUNT(*) AS events,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users
FROM subscription_events
GROUP BY event_type, entitlement_state
ORDER BY events DESC;

-- Recent subscription events
SELECT
  occurred_at,
  event_type,
  entitlement_state,
  product_id,
  source,
  client_name,
  metadata
FROM subscription_events
ORDER BY occurred_at DESC
LIMIT 100;

-- Errors by type/tool
SELECT
  error_type,
  tool_name,
  COUNT(*) AS errors,
  MAX(occurred_at) AS latest_error
FROM mcp_errors
GROUP BY error_type, tool_name
ORDER BY errors DESC;

-- Recent sanitized errors
SELECT
  occurred_at,
  tool_name,
  error_type,
  client_name,
  metadata
FROM mcp_errors
ORDER BY occurred_at DESC
LIMIT 100;

-- Languages from raw metadata
SELECT
  metadata->>'uiLanguage' AS ui_language,
  COUNT(*) AS calls
FROM mcp_usage_events
WHERE metadata ? 'uiLanguage'
GROUP BY 1
ORDER BY calls DESC;

SELECT
  metadata->>'outputLanguage' AS output_language,
  COUNT(*) AS calls
FROM mcp_usage_events
WHERE metadata ? 'outputLanguage'
GROUP BY 1
ORDER BY calls DESC;

-- Compare usage
SELECT
  COUNT(*) AS compare_calls,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS compare_users,
  AVG(NULLIF(metadata->>'providerCount','')::numeric) AS avg_provider_count
FROM mcp_usage_events
WHERE tool_name = 'prepare_compare';

-- Entitlement states observed during MCP calls
SELECT
  metadata->>'entitlementState' AS entitlement_state,
  COUNT(*) AS calls,
  COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS users
FROM mcp_usage_events
WHERE metadata ? 'entitlementState'
GROUP BY 1
ORDER BY calls DESC;

-- Daily metrics table
SELECT *
FROM mcp_daily_metrics
ORDER BY metric_date DESC, dimension_type, dimension_value
LIMIT 500;
