/**
 * POLY-GLOT MCP USAGE ANALYTICS — v2
 *
 * Records every MCP tool invocation to the `mcp_usage_events` table
 * in Neon Postgres. Analytics must NEVER cause an MCP request to fail.
 * If the insert throws, the error is logged server-side and the tool
 * continues normally.
 *
 * v2 additions:
 * - HMAC-SHA256 hashing with ANALYTICS_HASH_SALT (falls back to SHA-256)
 * - Traffic classification: customer, anonymous, directory_check, health_check, test, unknown
 * - Reported client name/version preserved alongside normalized family
 * - Request-level correlation key (request_key)
 * - Attribution fields: referer_host, origin_host
 * - No raw tokens, API keys, prompts, audio, full URLs, or PII
 *
 * Security rules:
 * - No raw OAuth/access tokens, passwords, API keys, or full prompt contents.
 * - User identifiers are HMAC-SHA256 hashed (or SHA-256 fallback) before storage.
 * - No sensitive personal information.
 */
import { createHash, createHmac, randomUUID } from "node:crypto";
import { pool } from "./entitlement-service/db.js";

export const ANALYTICS_VERSION = "2.0.0";

// ─── Hashing helpers ────────────────────────────────────────────────────────

/**
 * Privacy-safe HMAC-SHA256 hash. Falls back to plain SHA-256 if no salt configured.
 * Never log the salt.
 */
export function analyticsHash(value) {
  if (!value) return null;
  const salt = process.env.ANALYTICS_HASH_SALT;
  if (salt) {
    return createHmac("sha256", salt).update(String(value)).digest("hex");
  }
  // Legacy SHA-256 fallback for environments without salt
  return createHash("sha256").update(String(value)).digest("hex");
}

/** @deprecated Use analyticsHash() for new code. Kept for entitlement join compatibility. */
export function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// ─── Client detection ───────────────────────────────────────────────────────

/** Normalized client family names. */
const CLIENT_FAMILIES = [
  { pattern: /chatgpt|openai/i, family: "chatgpt" },
  { pattern: /claude|anthropic/i, family: "claude" },
  { pattern: /goose|block\.xyz/i, family: "goose" },
  { pattern: /cursor/i, family: "cursor" },
  { pattern: /windsurf|codeium/i, family: "windsurf" },
  { pattern: /continue/i, family: "continue" },
  { pattern: /zed/i, family: "zed" },
  { pattern: /cody|sourcegraph/i, family: "cody" },
  { pattern: /copilot|github/i, family: "copilot" },
];

/**
 * Detect the MCP client/host from available request context.
 * Returns a normalized family string.
 */
export function detectClient(extra, requestAuthToken = "") {
  const clientInfoName = (extra?.clientInfo?.name || "").toLowerCase();
  const issuer = (extra?.authInfo?.issuer || "").toLowerCase();
  const clientId = (extra?.authInfo?.clientId || "").toLowerCase();
  const userAgent = (extra?._userAgent || "").toLowerCase();

  const signals = [clientInfoName, issuer, clientId, userAgent].join(" ");
  for (const { pattern, family } of CLIENT_FAMILIES) {
    if (pattern.test(signals)) return family;
  }
  // Neon MCP Authorize OAuth issuer → ChatGPT integration
  if (/neon/i.test(issuer)) return "chatgpt";
  return "unknown";
}

/**
 * Extract reported client name + version from MCP initialize clientInfo.
 * Sanitize to <=120 chars. Never store raw headers.
 */
export function extractReportedClient(extra) {
  const name = String(extra?.clientInfo?.name || "").slice(0, 120).trim() || null;
  const version = String(extra?.clientInfo?.version || "").slice(0, 60).trim() || null;
  return { reportedClientName: name, reportedClientVersion: version };
}

// ─── Traffic classification ─────────────────────────────────────────────────

/** Directory/crawler/bot patterns in client name or user-agent. */
const DIRECTORY_PATTERNS = /validator|crawler|bot|health|check|registry|directory|glama|mcp\.so|smithery|opentools|mcphub/i;

/**
 * Classify traffic into: test, health_check, directory_check, customer, anonymous, unknown.
 * Pure function — no side effects.
 */
export function classifyTraffic({ clientInfo, userAgent, path, method, testRun, authenticated }) {
  // 1. Test/CI/smoke
  if (testRun) return "test";

  // 2. Health check endpoints
  if (path === "/healthz" || (path === "/" && method === "GET")) return "health_check";

  // 3. Directory/crawler/bot/validator
  const clientName = (clientInfo?.name || "").toLowerCase();
  const ua = (userAgent || "").toLowerCase();
  if (DIRECTORY_PATTERNS.test(clientName) || DIRECTORY_PATTERNS.test(ua)) return "directory_check";

  // 4. Authenticated interactive client → customer
  if (authenticated) return "customer";

  // 5. Recognized interactive MCP client without auth → anonymous
  const family = detectClient({ clientInfo, _userAgent: userAgent });
  if (family !== "unknown") return "anonymous";

  // 6. Unknown
  return "unknown";
}

// ─── User / session key derivation ──────────────────────────────────────────

/**
 * Derive a hashed user key from MCP extra context.
 * Uses legacy SHA-256 hash to maintain compatibility with existing entitlement joins.
 */
export function deriveUserKey(extra) {
  const token = extra?.authInfo?.token || extra?.authInfo?.accessToken || "";
  if (token) return hash(token);
  return null;
}

/**
 * Derive a session key from MCP session context when available.
 */
export function deriveSessionKey(extra) {
  const sessionId = extra?.sessionId || extra?._sessionId || "";
  if (sessionId) return analyticsHash(sessionId);
  return null;
}

// ─── Attribution helpers ────────────────────────────────────────────────────

/**
 * Extract host-only from a URL string. Never stores full URL or query params.
 */
function extractHost(urlStr) {
  if (!urlStr) return null;
  try {
    return new URL(urlStr).hostname.slice(0, 120) || null;
  } catch {
    // Not a valid URL — try bare hostname extraction
    const match = String(urlStr).match(/^(?:https?:\/\/)?([^/:?#]+)/);
    return match ? match[1].slice(0, 120) : null;
  }
}

/**
 * Build sanitized request context from raw HTTP headers.
 * Only extracts host-level referer/origin. Never stores full URLs,
 * query strings, raw IPs, or Authorization headers.
 */
export function sanitizeRequestContext(headers) {
  return {
    userAgent: String(headers?.["user-agent"] || "").slice(0, 200),
    refererHost: extractHost(headers?.referer || headers?.referrer || ""),
    originHost: extractHost(headers?.origin || ""),
  };
}

// ─── Test detection ─────────────────────────────────────────────────────────

/**
 * Detect if this is a test/CI run that should not pollute production analytics.
 */
export function isTestRun(extra) {
  if (process.env.POLYGLOT_TEST_RUN === "true" || process.env.CI === "true") return true;
  const clientName = (extra?.clientInfo?.name || "").toLowerCase();
  if (/test|smoke|ci|check|verify/i.test(clientName)) return true;
  return false;
}

// ─── Core analytics recording ───────────────────────────────────────────────

const INSERT_SQL = `
  INSERT INTO mcp_usage_events
    (occurred_at, event_type, tool_name, user_key, session_key,
     authenticated, source, client_name, metadata,
     traffic_class, reported_client_name, reported_client_version,
     referer_host, origin_host, request_key, analytics_version)
  VALUES
    (now(), $1, $2, $3, $4, $5, $6, $7, $8,
     $9, $10, $11, $12, $13, $14, $15)
`;

/**
 * Record a single MCP usage event. Fire-and-forget. Never throws.
 *
 * @param {object} params
 * @param {string} params.eventType         - e.g. "tool_call"
 * @param {string} params.toolName          - registered MCP tool name
 * @param {string|null} params.userKey
 * @param {string|null} params.sessionKey
 * @param {boolean} params.authenticated
 * @param {string} params.source            - "mcp"
 * @param {string} params.clientName        - normalized client family
 * @param {object} params.metadata          - tool-specific metadata (no secrets)
 * @param {string} params.trafficClass      - traffic classification
 * @param {string|null} params.reportedClientName
 * @param {string|null} params.reportedClientVersion
 * @param {string|null} params.refererHost
 * @param {string|null} params.originHost
 * @param {string|null} params.requestKey
 */
export async function recordMcpUsage({
  eventType = "tool_call",
  toolName,
  userKey = null,
  sessionKey = null,
  authenticated = false,
  source = "mcp",
  clientName = "unknown",
  metadata = {},
  trafficClass = "unknown",
  reportedClientName = null,
  reportedClientVersion = null,
  refererHost = null,
  originHost = null,
  requestKey = null,
} = {}) {
  try {
    await pool.query(INSERT_SQL, [
      eventType,
      toolName,
      userKey,
      sessionKey,
      authenticated,
      source,
      clientName,
      JSON.stringify(metadata),
      trafficClass,
      reportedClientName,
      reportedClientVersion,
      refererHost,
      originHost,
      requestKey,
      ANALYTICS_VERSION,
    ]);
  } catch (err) {
    console.error("[analytics] Failed to record MCP usage event:", err.message);
  }
}

// ─── Request-level telemetry ────────────────────────────────────────────────

const INSERT_REQUEST_SQL = `
  INSERT INTO mcp_request_events
    (occurred_at, request_key, event_type, method, path, traffic_class,
     client_name, reported_client_name, reported_client_version,
     authenticated, referer_host, origin_host, metadata)
  VALUES
    (now(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
`;

/**
 * Record an HTTP request-level event. Fire-and-forget. Never throws.
 * Used for MCP POST/GET/DELETE, health, initialize, tools/list.
 */
export async function recordRequestEvent({
  requestKey = null,
  eventType = "mcp_request",
  method = null,
  path = null,
  trafficClass = "unknown",
  clientName = "unknown",
  reportedClientName = null,
  reportedClientVersion = null,
  authenticated = false,
  refererHost = null,
  originHost = null,
  metadata = {},
} = {}) {
  try {
    await pool.query(INSERT_REQUEST_SQL, [
      requestKey,
      eventType,
      method,
      path,
      trafficClass,
      clientName,
      reportedClientName,
      reportedClientVersion,
      authenticated,
      refererHost,
      originHost,
      JSON.stringify(metadata),
    ]);
  } catch (err) {
    console.error("[analytics] Failed to record request event:", err.message);
  }
}

// ─── Composite context builder ──────────────────────────────────────────────

/**
 * Build complete analytics context from MCP extra, request auth token,
 * and sanitized request context.
 *
 * Used by every tool handler to avoid repetition.
 */
export function analyticsContext(extra, requestAuthToken = "", reqCtx = {}) {
  const token = extra?.authInfo?.token || extra?.authInfo?.accessToken || requestAuthToken || "";
  const testRun = isTestRun(extra);
  const authenticated = Boolean(token);
  const clientName = detectClient(extra, requestAuthToken);
  const { reportedClientName, reportedClientVersion } = extractReportedClient(extra);
  const trafficClass = classifyTraffic({
    clientInfo: extra?.clientInfo,
    userAgent: reqCtx.userAgent || extra?._userAgent || "",
    path: reqCtx.path || "/mcp",
    method: reqCtx.method || "POST",
    testRun,
    authenticated,
  });

  return {
    userKey: token ? hash(token) : null,
    sessionKey: deriveSessionKey(extra),
    authenticated,
    clientName,
    source: "mcp",
    testRun,
    trafficClass,
    reportedClientName,
    reportedClientVersion,
    refererHost: reqCtx.refererHost || null,
    originHost: reqCtx.originHost || null,
    requestKey: reqCtx.requestKey || randomUUID(),
  };
}

/**
 * Convenience: record a tool call with standard context + tool-specific metadata.
 * Never throws. Returns immediately (fire-and-forget).
 */
export function trackToolCall(toolName, extra, requestAuthToken, metadata = {}, reqCtx = {}) {
  const ctx = analyticsContext(extra, requestAuthToken, reqCtx);
  const enrichedMeta = ctx.testRun ? { ...metadata, test_run: true } : metadata;
  // Do not await — fire and forget so MCP response is never delayed
  recordMcpUsage({
    eventType: "tool_call",
    toolName,
    ...ctx,
    metadata: enrichedMeta,
  }).catch(() => {});
  // Return context so caller can pass to expandedTrack
  return ctx;
}
