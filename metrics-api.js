/**
 * POLY-GLOT PUBLIC METRICS API
 *
 * Read-only aggregated metrics endpoint for the dashboard.
 * No PII, no user keys, no raw tokens. Only aggregate counts.
 * Protected by optional METRICS_API_KEY for non-public deployments.
 */
import { pool } from "./entitlement-service/db.js";

/**
 * Return aggregated public metrics. Never exposes individual user data.
 */
export async function getPublicMetrics() {
  const metrics = {
    generated_at: new Date().toISOString(),
    version: "2.0.0",
  };

  try {
    // ── Total events summary ──────────────────────────────────
    const totals = await pool.query(`
      SELECT
        COUNT(*) AS total_events,
        COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS unique_users,
        COUNT(DISTINCT session_key) FILTER (WHERE session_key IS NOT NULL) AS unique_sessions,
        MIN(occurred_at) AS first_event,
        MAX(occurred_at) AS last_event
      FROM mcp_usage_events
    `);
    metrics.totals = totals.rows[0];

    // ── Events by traffic class ───────────────────────────────
    const byClass = await pool.query(`
      SELECT COALESCE(traffic_class, 'unknown') AS traffic_class, COUNT(*) AS calls,
             COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS unique_users
      FROM mcp_usage_events
      GROUP BY 1 ORDER BY calls DESC
    `);
    metrics.by_traffic_class = byClass.rows;

    // ── Events by client ──────────────────────────────────────
    const byClient = await pool.query(`
      SELECT COALESCE(client_name, 'unknown') AS client, COUNT(*) AS calls,
             COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS unique_users
      FROM mcp_usage_events
      GROUP BY 1 ORDER BY calls DESC
    `);
    metrics.by_client = byClient.rows;

    // ── Events by tool (exclude non-human) ────────────────────
    const byTool = await pool.query(`
      SELECT tool_name, COUNT(*) AS calls,
             COUNT(DISTINCT user_key) FILTER (WHERE user_key IS NOT NULL) AS unique_users
      FROM mcp_usage_events
      WHERE COALESCE(traffic_class, 'unknown') NOT IN ('health_check', 'directory_check', 'test')
      GROUP BY tool_name ORDER BY calls DESC
    `);
    metrics.by_tool = byTool.rows;

    // ── Daily volume (last 30 days) ───────────────────────────
    const daily = await pool.query(`
      SELECT date_trunc('day', occurred_at)::date AS day,
             COALESCE(traffic_class, 'unknown') AS traffic_class,
             COUNT(*) AS calls
      FROM mcp_usage_events
      WHERE occurred_at >= now() - interval '30 days'
      GROUP BY 1, 2 ORDER BY 1 DESC, 3 DESC
    `);
    metrics.daily_volume = daily.rows;

    // ── Request events summary ────────────────────────────────
    const reqEvents = await pool.query(`
      SELECT COALESCE(traffic_class, 'unknown') AS traffic_class,
             COALESCE(event_type, 'unknown') AS event_type,
             COUNT(*) AS calls,
             MAX(occurred_at) AS last_seen
      FROM mcp_request_events
      GROUP BY 1, 2 ORDER BY calls DESC
    `);
    metrics.request_events = reqEvents.rows;

    // ── Conversion funnel ─────────────────────────────────────
    const funnel = await pool.query(`
      SELECT event_type, COUNT(*) AS unique_users,
             MIN(occurred_at) AS first_at, MAX(occurred_at) AS last_at
      FROM conversion_events
      GROUP BY event_type ORDER BY unique_users DESC
    `);
    metrics.conversion_funnel = funnel.rows;

    // ── User summary ─────────────────────────────────────────
    const users = await pool.query(`
      SELECT COUNT(*) AS total_users,
             COUNT(*) FILTER (WHERE current_entitlement_state = 'trial') AS trial_users,
             COUNT(*) FILTER (WHERE current_entitlement_state LIKE 'pro_%') AS pro_users,
             COUNT(*) FILTER (WHERE last_seen >= now() - interval '7 days') AS active_7d,
             COUNT(*) FILTER (WHERE last_seen >= now() - interval '30 days') AS active_30d
      FROM mcp_users
    `);
    metrics.user_summary = users.rows[0];

    // ── Error summary (last 7 days) ──────────────────────────
    const errors = await pool.query(`
      SELECT COALESCE(tool_name, 'unknown') AS tool, COUNT(*) AS errors,
             MAX(occurred_at) AS last_error
      FROM mcp_errors
      WHERE occurred_at >= now() - interval '7 days'
      GROUP BY tool_name ORDER BY errors DESC
    `);
    metrics.recent_errors = errors.rows;

    // ── Subscription events ──────────────────────────────────
    const subs = await pool.query(`
      SELECT event_type, COUNT(*) AS events,
             MAX(occurred_at) AS last_at
      FROM subscription_events
      GROUP BY event_type ORDER BY events DESC
    `);
    metrics.subscription_events = subs.rows;

  } catch (err) {
    metrics.error = "Failed to query metrics: " + err.message;
  }

  return metrics;
}

/**
 * Handle /v1/metrics/public HTTP request.
 * Optional auth via METRICS_API_KEY query param or header.
 */
export async function handleMetricsRequest(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "x-metrics-key");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }

  // Optional auth
  const apiKey = process.env.METRICS_API_KEY;
  if (apiKey) {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const provided = req.headers["x-metrics-key"] || url.searchParams.get("key") || "";
    if (provided !== apiKey) {
      res.writeHead(403, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: "Invalid metrics key" }));
    }
  }

  const metrics = await getPublicMetrics();
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(metrics, null, 2));
}

/**
 * Handle /v1/metrics/public for Neon Functions (Web Standard Request/Response).
 */
export async function handleMetricsRequestWeb(request) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "x-metrics-key",
  };

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // Optional auth
  const apiKey = process.env.METRICS_API_KEY;
  if (apiKey) {
    const url = new URL(request.url);
    const provided = request.headers.get("x-metrics-key") || url.searchParams.get("key") || "";
    if (provided !== apiKey) {
      return Response.json({ error: "Invalid metrics key" }, { status: 403, headers: corsHeaders });
    }
  }

  const metrics = await getPublicMetrics();
  return Response.json(metrics, { status: 200, headers: corsHeaders });
}
