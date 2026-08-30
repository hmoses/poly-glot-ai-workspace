/**
 * POLY-GLOT ANALYTICS EXPANSION
 *
 * Server-side helpers for user rollups, session rollups, conversion milestones,
 * subscription events, error recording, and daily aggregation.
 *
 * All functions are fire-and-forget safe: they catch errors internally and
 * log them rather than propagating. Analytics must NEVER break an MCP request.
 *
 * Security: no raw tokens, passwords, keys, prompts, or PII stored.
 */
import { pool } from "./entitlement-service/db.js";

// ─── User rollups ───────────────────────────────────────────────────────────

export async function upsertUser({ userKey, clientName, entitlementState }) {
  if (!userKey) return;
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
 * Milestones: first_call, first_search, first_template_open, first_build,
 *             first_compare, first_workspace_open, trial_started, pro_subscribed
 */
export async function recordConversion({ userKey, sessionKey, eventType, clientName, metadata = {} }) {
  if (!userKey || !eventType) return;
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
 */
export async function recordSubscriptionEvent({
  userKey, eventType, entitlementState, productId, source, clientName, metadata = {},
}) {
  try {
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
    // Sanitize: only keep first 200 chars of error type, strip anything that looks like a token
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
 * Called after trackToolCall in server.js to handle expansion rollups.
 * Fire-and-forget. Never throws.
 */
export function expandedTrack({ toolName, userKey, sessionKey, clientName, authenticated, entitlementState, metadata = {} }) {
  // User rollup
  upsertUser({ userKey, clientName, entitlementState }).catch(() => {});
  // Session rollup
  upsertSession({ sessionKey, userKey, clientName, authenticated }).catch(() => {});

  // Conversion milestones (fire per tool)
  if (userKey) {
    recordConversion({ userKey, sessionKey, eventType: "first_call", clientName }).catch(() => {});
    const milestoneMap = {
      search_templates: "first_search",
      get_template: "first_template_open",
      build_prompt: "first_build",
      prepare_compare: "first_compare",
      open_workspace: "first_workspace_open",
    };
    const milestone = milestoneMap[toolName];
    if (milestone) {
      recordConversion({ userKey, sessionKey, eventType: milestone, clientName }).catch(() => {});
    }
  }

  // Subscription milestones from entitlement state changes
  if (userKey && entitlementState) {
    if (entitlementState === "trial") {
      recordConversion({ userKey, sessionKey, eventType: "trial_started", clientName }).catch(() => {});
    }
    if (entitlementState === "pro_monthly" || entitlementState === "pro_annual") {
      recordConversion({ userKey, sessionKey, eventType: "pro_subscribed", clientName }).catch(() => {});
      recordSubscriptionEvent({
        userKey,
        eventType: entitlementState === "pro_monthly" ? "pro_monthly_active" : "pro_annual_active",
        entitlementState,
        clientName,
      }).catch(() => {});
    }
  }
}
