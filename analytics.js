/**
 * POLY-GLOT MCP USAGE ANALYTICS
 *
 * Records every MCP tool invocation to the existing `mcp_usage_events` table
 * in Neon Postgres. Analytics must NEVER cause an MCP request to fail. If the
 * insert throws, the error is logged server-side and the tool continues normally.
 *
 * Security rules:
 * - No raw OAuth/access tokens, passwords, API keys, or full prompt contents.
 * - User identifiers are SHA-256 hashed before storage.
 * - No sensitive personal information.
 */
import { createHash } from "node:crypto";
import { pool } from "./entitlement-service/db.js";

function hash(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

/**
 * Detect the MCP client/host from available request context.
 * Only returns a known value when it can be reliably determined.
 */
export function detectClient(extra, requestAuthToken = "") {
  // ChatGPT OAuth uses accounts.google.com or platform.openai.com issuers
  const issuer = extra?.authInfo?.issuer || "";
  const clientId = extra?.authInfo?.clientId || "";
  const userAgent = extra?._userAgent || "";

  if (/openai/i.test(issuer) || /openai/i.test(clientId) || /chatgpt/i.test(userAgent)) return "chatgpt";
  if (/anthropic/i.test(issuer) || /claude/i.test(clientId) || /claude/i.test(userAgent)) return "claude";
  if (/block\.xyz|goose/i.test(issuer) || /goose/i.test(userAgent)) return "goose";
  if (/cursor/i.test(issuer) || /cursor/i.test(userAgent) || /cursor/i.test(clientId)) return "cursor";
  // Neon MCP Authorize OAuth issuer is a known pattern for ChatGPT integrations
  if (/neon/i.test(issuer)) return "chatgpt";
  return "unknown";
}

/**
 * Derive a hashed user key from MCP extra context.
 * Matches the pattern in entitlements.js subjectKey() but always hashes.
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
  if (sessionId) return hash(sessionId);
  return null;
}

const INSERT_SQL = `
  INSERT INTO mcp_usage_events
    (occurred_at, event_type, tool_name, user_key, session_key,
     authenticated, source, client_name, metadata)
  VALUES
    (now(), $1, $2, $3, $4, $5, $6, $7, $8)
`;

/**
 * Record a single MCP usage event. Fire-and-forget. Never throws.
 *
 * @param {object} params
 * @param {string} params.eventType   - e.g. "tool_call"
 * @param {string} params.toolName    - one of the 7 MCP tools
 * @param {string|null} params.userKey
 * @param {string|null} params.sessionKey
 * @param {boolean} params.authenticated
 * @param {string} params.source      - "mcp"
 * @param {string} params.clientName  - detected client
 * @param {object} params.metadata    - tool-specific metadata (no secrets)
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
    ]);
  } catch (err) {
    console.error("[analytics] Failed to record MCP usage event:", err.message);
  }
}

/**
 * Build common analytics context from MCP extra and request auth token.
 * Used by every tool handler to avoid repetition.
 */
export function analyticsContext(extra, requestAuthToken = "") {
  const token = extra?.authInfo?.token || extra?.authInfo?.accessToken || requestAuthToken || "";
  return {
    userKey: token ? hash(token) : null,
    sessionKey: deriveSessionKey(extra),
    authenticated: Boolean(token),
    clientName: detectClient(extra, requestAuthToken),
    source: "mcp",
  };
}

/**
 * Convenience: record a tool call with standard context + tool-specific metadata.
 * Never throws. Returns immediately (fire-and-forget).
 */
export function trackToolCall(toolName, extra, requestAuthToken, metadata = {}) {
  const ctx = analyticsContext(extra, requestAuthToken);
  // Do not await — fire and forget so MCP response is never delayed
  recordMcpUsage({
    eventType: "tool_call",
    toolName,
    ...ctx,
    metadata,
  }).catch(() => {});
}
