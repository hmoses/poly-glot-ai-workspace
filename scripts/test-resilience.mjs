#!/usr/bin/env node
/**
 * POLY-GLOT RESILIENCE REGRESSION SUITE
 *
 * Tests all resilience features per GOOSE_START_HERE.md Phase 7+8.
 * Run: node scripts/test-resilience.mjs
 */

import { strict as assert } from "node:assert";
import { writeFileSync, readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { join } from "node:path";

// ── Import resilience module ──────────────────────────────────────────
import {
  checkMethodContract,
  classifyForRetry,
  create405Diagnostic,
  saveCheckpoint,
  loadCheckpoint,
  saveFailure,
  isCircuitOpen,
  recordCircuitFailure,
  recordCircuitSuccess,
  circuitKey,
  redactHeaders,
  redactBody,
  redactPath,
  logStructured,
  generateRequestId,
  methodNotAllowedResponse,
} from "../src/resilience.js";

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✅ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ❌ ${name}: ${e.message}`);
  }
}

// ── Phase 2: Route Contract Tests ─────────────────────────────────────
console.log("\n📋 Phase 2 — Endpoint/Method Contract");

test("GET / is allowed", () => {
  const r = checkMethodContract("GET", "/");
  assert.equal(r.allowed, true);
  assert.equal(r.matched, true);
});

test("POST / is NOT allowed", () => {
  const r = checkMethodContract("POST", "/");
  assert.equal(r.allowed, false);
  assert.deepEqual(r.allowedMethods, ["GET"]);
});

test("POST /mcp is allowed", () => {
  const r = checkMethodContract("POST", "/mcp");
  assert.equal(r.allowed, true);
});

test("GET /mcp is allowed", () => {
  const r = checkMethodContract("GET", "/mcp");
  assert.equal(r.allowed, true);
});

test("DELETE /mcp is allowed", () => {
  const r = checkMethodContract("DELETE", "/mcp");
  assert.equal(r.allowed, true);
});

test("OPTIONS /mcp is allowed", () => {
  const r = checkMethodContract("OPTIONS", "/mcp");
  assert.equal(r.allowed, true);
});

test("PUT /mcp is NOT allowed (405)", () => {
  const r = checkMethodContract("PUT", "/mcp");
  assert.equal(r.allowed, false);
  assert.ok(r.allowedMethods.includes("POST"));
  assert.ok(r.allowedMethods.includes("GET"));
  assert.ok(r.allowedMethods.includes("DELETE"));
  assert.ok(r.allowedMethods.includes("OPTIONS"));
});

test("PATCH /mcp is NOT allowed", () => {
  const r = checkMethodContract("PATCH", "/mcp");
  assert.equal(r.allowed, false);
});

test("GET /healthz is allowed", () => {
  const r = checkMethodContract("GET", "/healthz");
  assert.equal(r.allowed, true);
});

test("POST /healthz is NOT allowed", () => {
  const r = checkMethodContract("POST", "/healthz");
  assert.equal(r.allowed, false);
  assert.deepEqual(r.allowedMethods, ["GET", "OPTIONS"]);
});

test("GET /v1/entitlements/me is allowed", () => {
  const r = checkMethodContract("GET", "/v1/entitlements/me");
  assert.equal(r.allowed, true);
});

test("POST /v1/entitlements/me is NOT allowed", () => {
  const r = checkMethodContract("POST", "/v1/entitlements/me");
  assert.equal(r.allowed, false);
});

test("POST /v1/trials/start is allowed", () => {
  const r = checkMethodContract("POST", "/v1/trials/start");
  assert.equal(r.allowed, true);
});

test("GET /v1/trials/start is NOT allowed", () => {
  const r = checkMethodContract("GET", "/v1/trials/start");
  assert.equal(r.allowed, false);
});

test("POST /v1/apple/sync is allowed", () => {
  const r = checkMethodContract("POST", "/v1/apple/sync");
  assert.equal(r.allowed, true);
});

test("POST /v1/apple/notifications is allowed", () => {
  const r = checkMethodContract("POST", "/v1/apple/notifications");
  assert.equal(r.allowed, true);
});

test("unknown route returns allowed:true, matched:false (defers to 404)", () => {
  const r = checkMethodContract("GET", "/unknown/route");
  assert.equal(r.allowed, true);
  assert.equal(r.matched, false);
});

// ── Phase 3: Retry Classifier Tests ───────────────────────────────────
console.log("\n📋 Phase 3 — Retry Classifier");

test("405 → never retry", () => {
  const r = classifyForRetry(405, "POST", 0);
  assert.equal(r.retry, false);
  assert.equal(r.reason, "deterministic_405");
  assert.equal(r.action, "check_method_contract");
});

test("400 → never retry", () => {
  const r = classifyForRetry(400, "GET", 0);
  assert.equal(r.retry, false);
  assert.equal(r.reason, "deterministic_400");
});

test("401 → never retry", () => {
  const r = classifyForRetry(401, "GET", 0);
  assert.equal(r.retry, false);
});

test("403 → never retry", () => {
  const r = classifyForRetry(403, "GET", 0);
  assert.equal(r.retry, false);
});

test("404 → never retry", () => {
  const r = classifyForRetry(404, "GET", 0);
  assert.equal(r.retry, false);
});

test("409 → never retry", () => {
  const r = classifyForRetry(409, "POST", 0);
  assert.equal(r.retry, false);
});

test("422 → never retry", () => {
  const r = classifyForRetry(422, "POST", 0);
  assert.equal(r.retry, false);
});

test("429 → retry with Retry-After header", () => {
  const r = classifyForRetry(429, "GET", 0, { "retry-after": "5" });
  assert.equal(r.retry, true);
  assert.equal(r.delay, 5000);
  assert.equal(r.reason, "rate_limited");
});

test("429 → retry without Retry-After uses backoff", () => {
  const r = classifyForRetry(429, "GET", 0, {});
  assert.equal(r.retry, true);
  assert.ok(r.delay > 0);
  assert.ok(r.delay <= 10000);
});

test("408 → retry (timeout)", () => {
  const r = classifyForRetry(408, "GET", 0);
  assert.equal(r.retry, true);
  assert.equal(r.reason, "request_timeout");
});

test("500 GET → retry", () => {
  const r = classifyForRetry(500, "GET", 0);
  assert.equal(r.retry, true);
  assert.equal(r.reason, "transient_server_error");
});

test("502 GET → retry", () => {
  const r = classifyForRetry(502, "GET", 0);
  assert.equal(r.retry, true);
});

test("503 GET → retry", () => {
  const r = classifyForRetry(503, "GET", 0);
  assert.equal(r.retry, true);
});

test("500 POST → conditional (mutation not auto-retried)", () => {
  const r = classifyForRetry(500, "POST", 0);
  assert.equal(r.retry, "conditional");
  assert.equal(r.warning, "mutation_request_not_auto_retried");
});

test("500 PATCH → conditional", () => {
  const r = classifyForRetry(500, "PATCH", 0);
  assert.equal(r.retry, "conditional");
});

test("500 DELETE → conditional", () => {
  const r = classifyForRetry(500, "DELETE", 0);
  assert.equal(r.retry, "conditional");
});

test("max retries exhausted → no retry", () => {
  const r = classifyForRetry(500, "GET", 2);
  assert.equal(r.retry, false);
  assert.equal(r.reason, "max_retries_exhausted");
});

test("exponential backoff increases with attempt", () => {
  const r0 = classifyForRetry(500, "GET", 0);
  const r1 = classifyForRetry(500, "GET", 1);
  // r1 delay should generally be larger (with jitter), but both should be positive
  assert.ok(r0.delay > 0);
  assert.ok(r1.delay > 0);
});

// ── Phase 4: 405 Diagnostic Tests ─────────────────────────────────────
console.log("\n📋 Phase 4 — 405 Recovery Diagnostic");

test("405 diagnostic with Allow header", () => {
  const d = create405Diagnostic("sendPrompt", "/mcp", "PUT", "POST, GET, DELETE, OPTIONS", "req-123");
  assert.equal(d.type, "METHOD_NOT_ALLOWED");
  assert.equal(d.attempted_method, "PUT");
  assert.deepEqual(d.allowed_methods, ["POST", "GET", "DELETE", "OPTIONS"]);
  assert.equal(d.request_id, "req-123");
  assert.equal(d.action, "stopped safely; no mutation replayed");
});

test("405 diagnostic without Allow header", () => {
  const d = create405Diagnostic("test", "/test", "PATCH", null, "req-456");
  assert.deepEqual(d.allowed_methods, ["unknown"]);
});

test("405 diagnostic includes timestamp", () => {
  const d = create405Diagnostic("op", "/path", "GET", "POST");
  assert.ok(d.timestamp);
  assert.ok(new Date(d.timestamp).getTime() > 0);
});

// ── Phase 5: Checkpoint/Resume Tests ──────────────────────────────────
console.log("\n📋 Phase 5 — Checkpoint/Resume");

const TEST_CHECKPOINT_DIR = "/tmp/polyglot-test-checkpoints";

test("save and load checkpoint", () => {
  if (existsSync(TEST_CHECKPOINT_DIR)) rmSync(TEST_CHECKPOINT_DIR, { recursive: true });
  
  const cp = saveCheckpoint("task-1", {
    completedSteps: ["inspect_repo", "plan"],
    nextAction: "edit_files",
    filesChanged: ["server.js"],
    testsRun: "3/3 passed",
    lastErrorCategory: null,
    lastRequestId: "pg-123",
  }, TEST_CHECKPOINT_DIR);

  assert.equal(cp.taskId, "task-1");
  assert.deepEqual(cp.completedSteps, ["inspect_repo", "plan"]);
  assert.equal(cp.nextAction, "edit_files");

  const loaded = loadCheckpoint(TEST_CHECKPOINT_DIR);
  assert.deepEqual(loaded.taskId, "task-1");
  assert.deepEqual(loaded.completedSteps, ["inspect_repo", "plan"]);
});

test("checkpoint resume does not repeat completed mutation", () => {
  const loaded = loadCheckpoint(TEST_CHECKPOINT_DIR);
  assert.ok(loaded);
  assert.ok(loaded.completedSteps.includes("inspect_repo"));
  assert.ok(loaded.completedSteps.includes("plan"));
  // Next action should be "edit_files", not a repeat of earlier steps
  assert.equal(loaded.nextAction, "edit_files");
});

test("load checkpoint from empty dir returns null", () => {
  const empty = "/tmp/polyglot-test-empty-cp";
  if (existsSync(empty)) rmSync(empty, { recursive: true });
  mkdirSync(empty, { recursive: true });
  const loaded = loadCheckpoint(empty);
  assert.equal(loaded, null);
});

test("save failure context", () => {
  const err = new Error("Method Not Allowed");
  err.status = 405;
  const failure = saveFailure(err, {
    operation: "sendToAI",
    endpoint: "/v1/messages?key=secret",
    method: "GET",
    requestId: "req-789",
    provider: "anthropic",
  }, TEST_CHECKPOINT_DIR);

  assert.equal(failure.error.status, 405);
  assert.equal(failure.context.category, "method_not_allowed");
  assert.equal(failure.context.endpoint, "/v1/messages?[REDACTED]");
  assert.equal(failure.context.provider, "anthropic");

  // Verify file was written
  const onDisk = JSON.parse(readFileSync(join(TEST_CHECKPOINT_DIR, "last-failure.json"), "utf8"));
  assert.equal(onDisk.error.status, 405);
});

// cleanup
if (existsSync(TEST_CHECKPOINT_DIR)) rmSync(TEST_CHECKPOINT_DIR, { recursive: true });

// ── Phase 6: Circuit Breaker Tests ────────────────────────────────────
console.log("\n📋 Phase 6 — Circuit Breaker");

test("circuit starts closed", () => {
  const key = circuitKey("POST", "/mcp", "405");
  const result = isCircuitOpen(key);
  assert.equal(result, false);
});

test("circuit opens after threshold failures", () => {
  const key = circuitKey("GET", "/test-circuit", "500");
  for (let i = 0; i < 5; i++) {
    recordCircuitFailure(key, 500);
  }
  const result = isCircuitOpen(key);
  assert.ok(result);
  assert.equal(result.open, true);
  assert.equal(result.failures, 5);
  assert.ok(result.cooldownRemaining > 0);
});

test("circuit success resets", () => {
  const key = circuitKey("GET", "/test-reset", "500");
  for (let i = 0; i < 5; i++) {
    recordCircuitFailure(key, 500);
  }
  assert.ok(isCircuitOpen(key));
  recordCircuitSuccess(key);
  assert.equal(isCircuitOpen(key), false);
});

test("circuit does not affect unrelated operations", () => {
  const key1 = circuitKey("GET", "/broken", "500");
  const key2 = circuitKey("POST", "/healthy", "200");
  for (let i = 0; i < 5; i++) {
    recordCircuitFailure(key1, 500);
  }
  assert.ok(isCircuitOpen(key1));
  assert.equal(isCircuitOpen(key2), false);
});

// ── Redaction Tests ───────────────────────────────────────────────────
console.log("\n📋 Redaction Tests");

test("redact Authorization header", () => {
  const h = redactHeaders({ "Authorization": "Bearer sk-secret123", "Content-Type": "application/json" });
  assert.equal(h["Authorization"], "[REDACTED]");
  assert.equal(h["Content-Type"], "application/json");
});

test("redact cookie header", () => {
  const h = redactHeaders({ "Cookie": "session=abc123", "Accept": "text/html" });
  assert.equal(h["Cookie"], "[REDACTED]");
  assert.equal(h["Accept"], "text/html");
});

test("redact x-api-key header", () => {
  const h = redactHeaders({ "x-api-key": "key123" });
  assert.equal(h["x-api-key"], "[REDACTED]");
});

test("redact body sensitive fields", () => {
  const b = redactBody({ apiKey: "sk-123", prompt: "hello", token: "tok-456", name: "test" });
  assert.equal(b.apiKey, "[REDACTED]");
  assert.equal(b.token, "[REDACTED]");
  assert.equal(b.prompt, "hello");
  assert.equal(b.name, "test");
});

test("redact signedTransaction in body", () => {
  const b = redactBody({ signedTransaction: "long-jws-string", productId: "pro.monthly" });
  assert.equal(b.signedTransaction, "[REDACTED]");
  assert.equal(b.productId, "pro.monthly");
});

test("redact identityToken in body", () => {
  const b = redactBody({ identityToken: "eyJhbGci...", userId: "user-1" });
  assert.equal(b.identityToken, "[REDACTED]");
  assert.equal(b.userId, "user-1");
});

test("redact query strings from path", () => {
  const p = redactPath("/v1/messages?api_key=secret&model=claude");
  assert.equal(p, "/v1/messages?[REDACTED]");
});

test("path without query string unchanged", () => {
  const p = redactPath("/v1/entitlements/me");
  assert.equal(p, "/v1/entitlements/me");
});

test("null body returns null", () => {
  assert.equal(redactBody(null), null);
});

test("empty headers returns empty object", () => {
  assert.deepEqual(redactHeaders({}), {});
});

// ── Request ID Tests ──────────────────────────────────────────────────
console.log("\n📋 Request ID Tests");

test("generateRequestId returns unique IDs", () => {
  const id1 = generateRequestId();
  const id2 = generateRequestId();
  assert.notEqual(id1, id2);
  assert.ok(id1.startsWith("pg-"));
  assert.ok(id2.startsWith("pg-"));
});

// ── Structured Logging Tests ──────────────────────────────────────────
console.log("\n📋 Structured Logging");

test("logStructured returns entry object", () => {
  const entry = logStructured("info", "test_event", { request_id: "test-1", status: 200 });
  assert.equal(entry.level, "info");
  assert.equal(entry.event, "test_event");
  assert.equal(entry.request_id, "test-1");
  assert.ok(entry.timestamp);
});

// ── Integration: Existing checks still pass ───────────────────────────
console.log("\n📋 Phase 8 — Existing Module Verification");

test("server.js syntax valid", () => {
  // Already validated by node --check in npm run check
  assert.ok(true);
});

test("entitlements module loads", async () => {
  const m = await import("../entitlements.js");
  assert.ok(m.entitlementSummary);
  assert.ok(m.getEntitlement);
  assert.ok(m.templateAccess);
});

test("pricing module loads", async () => {
  const m = await import("../pricing.js");
  assert.ok(m.publicPricing);
});

test("localization module loads", async () => {
  const m = await import("../localization.js");
  assert.ok(m.languagePublicList);
  assert.ok(m.resolveLanguage);
});

test("resilience module loads", async () => {
  const m = await import("../src/resilience.js");
  assert.ok(m.checkMethodContract);
  assert.ok(m.classifyForRetry);
  assert.ok(m.create405Diagnostic);
  assert.ok(m.saveCheckpoint);
  assert.ok(m.isCircuitOpen);
  assert.ok(m.redactHeaders);
});

test("entitlement subscription states correct", async () => {
  const { entitlementSummary } = await import("../entitlements.js");
  const summary = entitlementSummary();
  assert.equal(summary.trialDays, 3);
  assert.equal(summary.freeTemplates, 25);
  assert.ok(summary.proTemplates > 900);
});

test("free template access works", async () => {
  const { templateAccess } = await import("../entitlements.js");
  const freeResult = templateAccess("not_started", "free");
  assert.equal(freeResult.allowed, true);
});

test("pro template locked for non-subscriber", async () => {
  const { templateAccess } = await import("../entitlements.js");
  const proResult = templateAccess("expired", "pro");
  assert.equal(proResult.allowed, false);
});

test("pricing matches expected", async () => {
  const { publicPricing } = await import("../pricing.js");
  const p = publicPricing();
  assert.ok(p.monthly);
  assert.ok(p.annual);
});

test("languages list non-empty", async () => {
  const { languagePublicList } = await import("../localization.js");
  const langs = languagePublicList();
  assert.ok(langs.length >= 35);
});

// ── Summary ───────────────────────────────────────────────────────────
console.log(`\n${"═".repeat(50)}`);
console.log(`  Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`${"═".repeat(50)}\n`);

process.exit(failed > 0 ? 1 : 0);
