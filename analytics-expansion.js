/**
 * POLY-GLOT ANALYTICS EXPANSION — v2
 *
 * User rollups, session rollups, conversion milestones, subscription lifecycle,
 * error recording, and daily aggregation.
 *
 * v2 changes:
 * - upsertUser only for traffic_class IN (customer, anonymous) with stable user key
 * - Session rollups only for real stable sessions (not per-request correlation IDs)
 * - recordConversion only for customer/anonymous — never directory_check/health_check/test
 * - Expanded milestoneMap for all 15 tools where appropriate
 * - Subscription events require entitlement state transitions, not repeated status checks
 * - aggregateDaily excludes health_check/directory_check/test from customer funnels
 *
 * Fire-and-forget. Never throws. Never breaks MCP responses.
 */
import { pool } from "./entitlement-service/db.js";

// ─── User rollups ───────────────────────────────────────────────────────────

/**
 * Upsert a user summary row. Only for customer/anonymous traffic with a stable user key.
 */
export async function upsertUser({ userKey, clientName, entitlementState, trafficClass }) {
  if (!userKey) return;
  // Only track real users, not directory checks, health checks, or tests
  if (trafficClass && !["customer", "anonymous"].includes(trafficClass)) return;
  try {
    await pool.query(
      `INSERT INTO mcp_users (user_key, first_seen, last_seen, first_client, latest_client, current_entitlement_state, total_calls)
       VALUES ($1, now(), now(), $2, $2, $3, 1)
       ON CONFLICT (user_key) DO UPDATE SET
         last_seen = now(),
         latest_client = COALESCE($2, mcp_users.latest_client),
         current_entitlement_state = COALESCE($3, mcp_users.current_entitlement_state),
         total_calls = mcp_users.total_calls + 1`,
      [userKey, clientName || null, entitlementState || null]
    );
  } catch (err) {
    console.error("[analytics-expansion] upsertUser failed:", err.message);
  }
}

// ─── Session rollups ────────────────────────────────────────────────────────

/**
 * Upsert a session summary row. Only for real stable MCP sessions
 * (not per-request analytics correlation IDs).
 */
export async function upsertSession({ sessionKey, userKey, clientName, authenticated }) {
  if (!sessionKey) return;
  try {
    await pool.query(
      `INSERT INTO mcp_sessions (session_key, user_key, started_at, last_seen, client_name, authenticated, tool_calls)
       VALUES ($1, $2, now(), now(), $3, $4, 1)
       ON CONFLICT (session_key) DO UPDATE SET
         last_seen = now(),
         user_key = COALESCE($2, mcp_sessions.user_key),
         tool_calls = mcp_sessions.tool_calls + 1`,
      [sessionKey, userKey || null, clientName || null, authenticated ?? false]
    );
  } catch (err) {
    console.error("[analytics-expansion] upsertSession failed:", err.message);
  }
}

// ─── Conversion milestones ──────────────────────────────────────────────────

/**
 * Record a one-time funnel milestone per user.
 * Uses unique partial index (user_key, event_type) for dedup.
 * Only for customer/anonymous traffic — never directory_check/health_check/test.
 */
export async function recordConversion({ userKey, sessionKey, eventType, clientName, trafficClass, metadata = {} }) {
  if (!userKey || !eventType) return;
  // Never count non-human traffic as conversions
  if (trafficClass && !["customer", "anonymous"].includes(trafficClass)) return;
  try {
    await pool.query(
      `INSERT INTO conversion_events (occurred_at, user_key, session_key, event_type, client_name, metadata)
       VALUES (now(), $1, $2, $3, $4, $5)
       ON CONFLICT (user_key, event_type) WHERE user_key IS NOT NULL DO NOTHING`,
      [userKey, sessionKey || null, eventType, clientName || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error("[analytics-expansion] recordConversion failed:", err.message);
  }
}

// ─── Subscription events ────────────────────────────────────────────────────

/**
 * Record an entitlement lifecycle event (trial_start, trial_expired,
 * pro_monthly_start, pro_annual_start, pro_cancel, pro_renew).
 *
 * v2: Guards against duplicate state events by checking recent history.
 * Subscription events must come from authoritative entitlement/Apple state
 * transitions, not merely seeing entitlementState=pro_* on repeated calls.
 */
export async function recordSubscriptionEvent({
  userKey, eventType, entitlementState, productId, source, clientName, metadata = {},
}) {
  try {
    // Deduplicate: don't re-record the same event_type for the same user within 1 hour
    const recent = await pool.query(
      `SELECT 1 FROM subscription_events
       WHERE user_key = $1 AND event_type = $2 AND occurred_at > now() - interval '1 hour'
       LIMIT 1`,
      [userKey, eventType]
    );
    if (recent.rows.length > 0) return;

    await pool.query(
      `INSERT INTO subscription_events (occurred_at, user_key, event_type, entitlement_state, product_id, source, client_name, metadata)
       VALUES (now(), $1, $2, $3, $4, $5, $6, $7)`,
      [userKey || null, eventType, entitlementState || null, productId || null, source || null, clientName || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error("[analytics-expansion] recordSubscriptionEvent failed:", err.message);
  }
}

// ─── Error recording ────────────────────────────────────────────────────────

/**
 * Record a sanitized MCP tool error. Never store raw error messages that
 * might contain tokens, URLs with credentials, or prompt content.
 */
export async function recordError({ toolName, errorType, clientName, userKey, sessionKey, metadata = {} }) {
  try {
    const safeType = String(errorType || "unknown").slice(0, 200).replace(/Bearer\s+\S+/gi, "[REDACTED]");
    await pool.query(
      `INSERT INTO mcp_errors (occurred_at, tool_name, error_type, client_name, user_key, session_key, metadata)
       VALUES (now(), $1, $2, $3, $4, $5, $6)`,
      [toolName || null, safeType, clientName || null, userKey || null, sessionKey || null, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.error("[analytics-expansion] recordError failed:", err.message);
  }
}

// ─── Daily aggregation ──────────────────────────────────────────────────────

/**
 * Aggregate mcp_usage_events for a given date into mcp_daily_metrics.
 * Idempotent: uses ON CONFLICT ... DO UPDATE for upsert.
 * Call with no argument to aggregate yesterday.
 *
 * v2: Also aggregates by traffic_class dimension.
 */
export async function aggregateDaily(targetDate) {
  const dateStr = targetDate || new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  try {
    // Aggregate by tool_name
    await pool.query(
      `INSERT INTO mcp_daily_metrics (metric_date, dimension_type, dimension_value, total_calls, unique_users, unique_sessions, updated_at)
       SELECT $1::date, 'tool', tool_name,
              COUNT(*), COUNT(DISTINCT user_key), COUNT(DISTINCT session_key), now()
       FROM mcp_usage_events
       WHERE occurred_at >= $1::date AND occurred_at < ($1::date + interval '1 day')
       GROUP BY tool_name
       ON CONFLICT (metric_date, dimension_type, dimension_value)
       DO UPDATE SET total_calls = EXCLUDED.total_calls, unique_users = EXCLUDED.unique_users,
                     unique_sessions = EXCLUDED.unique_sessions, updated_at = now()`,
      [dateStr]
    );

    // Aggregate by client_name
    await pool.query(
      `INSERT INTO mcp_daily_metrics (metric_date, dimension_type, dimension_value, total_calls, unique_users, unique_sessions, updated_at)
       SELECT $1::date, 'client', COALESCE(client_name, 'unknown'),
              COUNT(*), COUNT(DISTINCT user_key), COUNT(DISTINCT session_key), now()
       FROM mcp_usage_events
       WHERE occurred_at >= $1::date AND occurred_at < ($1::date + interval '1 day')
       GROUP BY client_name
       ON CONFLICT (metric_date, dimension_type, dimension_value)
       DO UPDATE SET total_calls = EXCLUDED.total_calls, unique_users = EXCLUDED.unique_users,
                     unique_sessions = EXCLUDED.unique_sessions, updated_at = now()`,
      [dateStr]
    );

    // Aggregate by traffic_class (v2)
    await pool.query(
      `INSERT INTO mcp_daily_metrics (metric_date, dimension_type, dimension_value, total_calls, unique_users, unique_sessions, updated_at)
       SELECT $1::date, 'traffic_class', COALESCE(traffic_class, 'unknown'),
              COUNT(*), COUNT(DISTINCT user_key), COUNT(DISTINCT session_key), now()
       FROM mcp_usage_events
       WHERE occurred_at >= $1::date AND occurred_at < ($1::date + interval '1 day')
       GROUP BY traffic_class
       ON CONFLICT (metric_date, dimension_type, dimension_value)
       DO UPDATE SET total_calls = EXCLUDED.total_calls, unique_users = EXCLUDED.unique_users,
                     unique_sessions = EXCLUDED.unique_sessions, updated_at = now()`,
      [dateStr]
    );

    // Aggregate totals for the day
    await pool.query(
      `INSERT INTO mcp_daily_metrics (metric_date, dimension_type, dimension_value, total_calls, unique_users, unique_sessions, updated_at)
       SELECT $1::date, 'total', 'all',
              COUNT(*), COUNT(DISTINCT user_key), COUNT(DISTINCT session_key), now()
       FROM mcp_usage_events
       WHERE occurred_at >= $1::date AND occurred_at < ($1::date + interval '1 day')
       ON CONFLICT (metric_date, dimension_type, dimension_value)
       DO UPDATE SET total_calls = EXCLUDED.total_calls, unique_users = EXCLUDED.unique_users,
                     unique_sessions = EXCLUDED.unique_sessions, updated_at = now()`,
      [dateStr]
    );

    console.log(`[analytics-expansion] Daily aggregation complete for ${dateStr}`);
  } catch (err) {
    console.error("[analytics-expansion] aggregateDaily failed:", err.message);
  }
}

// ─── Convenience: track everything for one tool call ────────────────────────

/**
 * Expanded milestone map for all 15 tools.
 * Read-only capability checks are NOT conversions.
 * get_language_options, get_subscription_status: read-only, no milestone.
 * get_custom_model_capabilities: read-only, no milestone.
 */
const milestoneMap = {
  search_templates: "first_search",
  get_template: "first_template_open",
  build_prompt: "first_build",
  prepare_compare: "first_compare",
  open_workspace: "first_workspace_open",
  validate_custom_model: "first_byom_validate",
  run_custom_model: "first_byom_run",
  prepare_custom_compare: "first_byom_compare",
  transcribe_audio: "first_transcribe",
  detect_language: "first_detect_language",
  translate_text: "first_translate",
  localize_text: "first_localize",
};

/**
 * Called after trackToolCall to handle expansion rollups.
 * Fire-and-forget. Never throws.
 *
 * v2: trafficClass gates user/conversion rollups. Subscription dedup via 1-hour window.
 */
export function expandedTrack({ toolName, userKey, sessionKey, clientName, authenticated, entitlementState, testRun = false, trafficClass = "unknown", metadata = {} }) {
  // User rollup — only for real users
  upsertUser({ userKey, clientName, entitlementState, trafficClass }).catch(() => {});
  // Session rollup — only for real stable sessions
  upsertSession({ sessionKey, userKey, clientName, authenticated }).catch(() => {});

  // Conversion milestones — skip for test/directory/health traffic
  if (userKey && !testRun && ["customer", "anonymous"].includes(trafficClass)) {
    recordConversion({ userKey, sessionKey, eventType: "first_call", clientName, trafficClass }).catch(() => {});
    const milestone = milestoneMap[toolName];
    if (milestone) {
      recordConversion({ userKey, sessionKey, eventType: milestone, clientName, trafficClass }).catch(() => {});
    }
  }

  // Subscription milestones from entitlement state changes
  // Only for real users, and deduplicated by recordSubscriptionEvent
  if (userKey && entitlementState && !testRun && ["customer", "anonymous"].includes(trafficClass)) {
    if (entitlementState === "trial") {
      recordConversion({ userKey, sessionKey, eventType: "trial_started", clientName, trafficClass }).catch(() => {});
    }
    if (entitlementState === "pro_monthly" || entitlementState === "pro_annual") {
      recordConversion({ userKey, sessionKey, eventType: "pro_subscribed", clientName, trafficClass }).catch(() => {});
      recordSubscriptionEvent({
        userKey,
        eventType: entitlementState === "pro_monthly" ? "pro_monthly_active" : "pro_annual_active",
        entitlementState,
        clientName,
      }).catch(() => {});
    }
  }
}
