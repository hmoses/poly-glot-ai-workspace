/**
 * POLY-GLOT RESILIENCE MODULE
 *
 * Provides:
 * 1. Request contract validation (Phase 2)
 * 2. Retry classifier with bounded backoff (Phase 3)
 * 3. 405 diagnostic with Allow header (Phase 4)
 * 4. Checkpoint/resume helpers (Phase 5)
 * 5. Circuit breaker (Phase 6)
 * 6. Structured logging with redaction (cross-cutting)
 *
 * This module does NOT modify Poly-Glot's API semantics.
 * It adds defense-in-depth for the MCP and entitlement HTTP handlers.
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";

// ── Phase 2: Endpoint/Method Contract ─────────────────────────────────

/**
 * Route contracts for Poly-Glot owned endpoints.
 * Maps pathname patterns to allowed HTTP methods.
 */
const ROUTE_CONTRACTS = Object.freeze({
  "/mcp":                       ["POST", "GET", "DELETE", "OPTIONS"],
  "/healthz":                   ["GET", "OPTIONS"],
  "/v1/entitlements/me":        ["GET", "OPTIONS"],
  "/v1/trials/start":           ["POST", "OPTIONS"],
  "/v1/apple/sync":             ["POST", "OPTIONS"],
  "/v1/apple/notifications":    ["POST", "OPTIONS"],
  "/":                          ["GET"],
});

/**
 * Check if a method is allowed for a given pathname.
 * Returns { allowed: true } or { allowed: false, allowedMethods: [...] }.
 */
export function checkMethodContract(method, pathname) {
  const allowed = ROUTE_CONTRACTS[pathname];
  if (!allowed) return { allowed: true, matched: false }; // unknown route, let handler 404
  if (allowed.includes(method.toUpperCase())) return { allowed: true, matched: true };
  return { allowed: false, matched: true, allowedMethods: allowed };
}

/**
 * Build a 405 response with proper Allow header and diagnostic body.
 */
export function methodNotAllowedResponse(res, method, pathname, allowedMethods, requestId) {
  const diagnostic = {
    error: "METHOD_NOT_ALLOWED",
    operation: pathname,
    endpoint: redactPath(pathname),
    attempted_method: method,
    allowed_methods: allowedMethods,
    request_id: requestId || generateRequestId(),
    action: "stopped safely; no mutation replayed",
  };

  res.writeHead(405, {
    "Allow": allowedMethods.join(", "),
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(diagnostic));

  logStructured("warn", "method_not_allowed", diagnostic);
  return diagnostic;
}

// ── Phase 3: Retry Classifier ─────────────────────────────────────────

/**
 * Classifies HTTP status codes for retry decisions.
 *
 * Returns:
 *   { retry: false, reason: string }           — deterministic, do not retry
 *   { retry: true, delay: number, reason: string } — transient, retry after delay
 *   { retry: "conditional", ... }              — depends on idempotency
 */
const MAX_RETRIES = 2;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 10000;

export function classifyForRetry(status, method, attempt, headers = {}) {
  // Deterministic client errors — never retry
  if ([400, 401, 403, 404, 405, 409, 422].includes(status)) {
    return {
      retry: false,
      reason: `deterministic_${status}`,
      status,
      action: status === 405 ? "check_method_contract" : "fix_request",
    };
  }

  // Budget exhausted
  if (attempt >= MAX_RETRIES) {
    return { retry: false, reason: "max_retries_exhausted", status, attempt };
  }

  // 429 — respect Retry-After
  if (status === 429) {
    const retryAfter = parseRetryAfter(headers["retry-after"]);
    const delay = retryAfter ? retryAfter * 1000 : computeDelay(attempt);
    return { retry: true, delay, reason: "rate_limited", status };
  }

  // 408 — timeout, safe to retry
  if (status === 408) {
    return { retry: true, delay: computeDelay(attempt), reason: "request_timeout", status };
  }

  // 5xx — transient server errors
  if (status >= 500 && status <= 599) {
    // POST/PATCH/PUT/DELETE: only retry if explicitly idempotent
    const isMutating = ["POST", "PATCH", "PUT", "DELETE"].includes(method.toUpperCase());
    if (isMutating) {
      return {
        retry: "conditional",
        delay: computeDelay(attempt),
        reason: "transient_server_error_mutation",
        status,
        warning: "mutation_request_not_auto_retried",
      };
    }
    return { retry: true, delay: computeDelay(attempt), reason: "transient_server_error", status };
  }

  // Everything else — don't retry
  return { retry: false, reason: "unclassified", status };
}

function computeDelay(attempt) {
  const delay = BASE_DELAY_MS * Math.pow(2, attempt) + Math.random() * 200;
  return Math.min(delay, MAX_DELAY_MS);
}

function parseRetryAfter(value) {
  if (!value) return null;
  const n = Number(value);
  if (!isNaN(n)) return n;
  const date = Date.parse(value);
  if (!isNaN(date)) return Math.max(0, (date - Date.now()) / 1000);
  return null;
}

// ── Phase 4: 405 Recovery ─────────────────────────────────────────────

/**
 * Creates a typed METHOD_NOT_ALLOWED diagnostic object.
 * Does NOT auto-resend with different method.
 */
export function create405Diagnostic(operation, endpoint, attemptedMethod, allowHeader, requestId) {
  const allowedMethods = allowHeader
    ? allowHeader.split(",").map((m) => m.trim())
    : ["unknown"];

  return {
    type: "METHOD_NOT_ALLOWED",
    operation,
    endpoint: redactPath(endpoint),
    attempted_method: attemptedMethod,
    allowed_methods: allowedMethods,
    request_id: requestId || generateRequestId(),
    action: "stopped safely; no mutation replayed",
    timestamp: new Date().toISOString(),
  };
}

// ── Phase 5: Checkpoint/Resume ────────────────────────────────────────

const DEFAULT_CHECKPOINT_DIR = ".goose";

/**
 * Save a task checkpoint after a meaningful milestone.
 */
export function saveCheckpoint(taskId, data, dir) {
  const checkpointDir = dir || DEFAULT_CHECKPOINT_DIR;
  ensureDir(checkpointDir);

  const checkpoint = {
    taskId,
    timestamp: new Date().toISOString(),
    completedSteps: data.completedSteps || [],
    nextAction: data.nextAction || null,
    filesChanged: data.filesChanged || [],
    testsRun: data.testsRun || null,
    lastErrorCategory: data.lastErrorCategory || null,
    lastRequestId: data.lastRequestId || null,
    metadata: data.metadata || {},
  };

  const path = join(checkpointDir, "task-checkpoint.json");
  writeFileSync(path, JSON.stringify(checkpoint, null, 2));
  return checkpoint;
}

/**
 * Load the last checkpoint for resume.
 */
export function loadCheckpoint(dir) {
  const path = join(dir || DEFAULT_CHECKPOINT_DIR, "task-checkpoint.json");
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Save failure context for next session recovery.
 */
export function saveFailure(error, context, dir) {
  const checkpointDir = dir || DEFAULT_CHECKPOINT_DIR;
  ensureDir(checkpointDir);

  const failure = {
    timestamp: new Date().toISOString(),
    error: {
      type: error.type || error.constructor?.name || "Error",
      message: error.message || String(error),
      status: error.status || error.statusCode || null,
      code: error.code || null,
    },
    context: {
      operation: context.operation || null,
      endpoint: context.endpoint ? redactPath(context.endpoint) : null,
      method: context.method || null,
      requestId: context.requestId || null,
      provider: context.provider || null,
      category: categorizeError(error),
    },
  };

  writeFileSync(join(checkpointDir, "last-failure.json"), JSON.stringify(failure, null, 2));
  return failure;
}

function categorizeError(error) {
  const status = error.status || error.statusCode;
  if (status === 405) return "method_not_allowed";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server_error";
  if (status >= 400) return "client_error";
  if (error.code === "ECONNREFUSED") return "connection_refused";
  if (error.code === "ETIMEDOUT") return "timeout";
  if (error.code === "ENOTFOUND") return "dns_failure";
  return "unknown";
}

// ── Phase 6: Circuit Breaker ──────────────────────────────────────────

const circuitState = new Map();
const CIRCUIT_THRESHOLD = 5;
const CIRCUIT_COOLDOWN_MS = 30000; // 30 seconds

/**
 * Check if a circuit is open (should block the call).
 */
export function isCircuitOpen(key) {
  const state = circuitState.get(key);
  if (!state) return false;
  if (state.failures >= CIRCUIT_THRESHOLD) {
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed < CIRCUIT_COOLDOWN_MS) {
      return {
        open: true,
        key,
        failures: state.failures,
        cooldownRemaining: Math.ceil((CIRCUIT_COOLDOWN_MS - elapsed) / 1000),
        lastStatus: state.lastStatus,
      };
    }
    // Cooldown expired — half-open, allow one probe
    state.failures = Math.floor(state.failures / 2);
    return false;
  }
  return false;
}

/**
 * Record a failure for circuit breaker tracking.
 */
export function recordCircuitFailure(key, status) {
  const state = circuitState.get(key) || { failures: 0, lastFailure: 0, lastStatus: null };
  state.failures += 1;
  state.lastFailure = Date.now();
  state.lastStatus = status;
  circuitState.set(key, state);
}

/**
 * Record a success — reset the circuit.
 */
export function recordCircuitSuccess(key) {
  circuitState.delete(key);
}

/**
 * Get circuit breaker key from operation + endpoint + method + status category.
 */
export function circuitKey(method, pathname, statusCategory) {
  return `${method}:${pathname}:${statusCategory}`;
}

// ── Structured Logging with Redaction ─────────────────────────────────

const REDACT_HEADERS = new Set([
  "authorization", "cookie", "set-cookie",
  "x-api-key", "x-apple-receipt", "x-access-token",
  "x-refresh-token", "proxy-authorization",
]);

const REDACT_BODY_KEYS = new Set([
  "apiKey", "api_key", "token", "accessToken", "access_token",
  "refreshToken", "refresh_token", "password", "secret",
  "receipt", "signedTransaction", "identityToken", "signedPayload",
]);

/**
 * Redact sensitive fields from headers.
 */
export function redactHeaders(headers) {
  if (!headers) return {};
  const safe = {};
  for (const [k, v] of Object.entries(headers)) {
    if (REDACT_HEADERS.has(k.toLowerCase())) {
      safe[k] = "[REDACTED]";
    } else {
      safe[k] = v;
    }
  }
  return safe;
}

/**
 * Redact sensitive fields from a body object (shallow).
 */
export function redactBody(body) {
  if (!body || typeof body !== "object") return body;
  const safe = { ...body };
  for (const key of Object.keys(safe)) {
    if (REDACT_BODY_KEYS.has(key)) {
      safe[key] = "[REDACTED]";
    }
  }
  return safe;
}

/**
 * Redact query strings from a path.
 */
export function redactPath(path) {
  if (!path) return path;
  const qIdx = path.indexOf("?");
  return qIdx >= 0 ? path.substring(0, qIdx) + "?[REDACTED]" : path;
}

/**
 * Structured log entry.
 */
export function logStructured(level, event, data) {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  // Remove undefined values
  for (const k of Object.keys(entry)) {
    if (entry[k] === undefined) delete entry[k];
  }
  const line = JSON.stringify(entry);
  if (level === "error") {
    console.error(line);
  } else if (level === "warn") {
    console.warn(line);
  } else {
    console.log(line);
  }
  return entry;
}

// ── Utilities ─────────────────────────────────────────────────────────

let requestCounter = 0;

export function generateRequestId() {
  return `pg-${Date.now()}-${++requestCounter}`;
}

function ensureDir(dir) {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}
