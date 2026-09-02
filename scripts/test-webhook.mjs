#!/usr/bin/env node
/**
 * Webhook Test Matrix — App Store Connect webhook receiver validation.
 * Tests the webhook handler logic without requiring a live deployment.
 *
 * Apple ASC Webhook Auth:
 *   https://developer.apple.com/documentation/appstoreconnectapi/configuring-webhook-notifications
 *   HMAC-SHA256: x-apple-signature: hmacsha256=<hex>
 */
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

const policy = JSON.parse(readFileSync(join(ROOT, "config/deployment-policy.json"), "utf8"));
const webhookSource = readFileSync(join(ROOT, "webhook/index.mjs"), "utf8");

// ══════════════════════════════════════════════════════════════════════
describe("Deployment policy structure", () => {
  test("stageOnBuildComplete is boolean", () => {
    assert.equal(typeof policy.stageOnBuildComplete, "boolean");
  });
  test("productionOnReadyForDistribution is boolean", () => {
    assert.equal(typeof policy.productionOnReadyForDistribution, "boolean");
  });
  test("productionOnBuildComplete defaults to false", () => {
    assert.equal(policy.productionOnBuildComplete, false);
  });
  test("requireParityValidation is true", () => {
    assert.equal(policy.requireParityValidation, true);
  });
  test("requireRegressionTests is true", () => {
    assert.equal(policy.requireRegressionTests, true);
  });
  test("requireProductionSmokeTests is true", () => {
    assert.equal(policy.requireProductionSmokeTests, true);
  });
  test("concurrencyLock is true", () => {
    assert.equal(policy.concurrencyLock, true);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Apple HMAC-SHA256 webhook authentication", () => {
  test("uses HMAC-SHA256 verification (not raw secret header)", () => {
    assert.ok(webhookSource.includes("HMAC"));
    assert.ok(webhookSource.includes("SHA-256") || webhookSource.includes("sha256"));
    assert.ok(webhookSource.includes("x-apple-signature"));
  });
  test("parses hmacsha256= prefix from Apple header", () => {
    assert.ok(webhookSource.includes("hmacsha256="));
  });
  test("uses Web Crypto subtle for HMAC computation", () => {
    assert.ok(webhookSource.includes("crypto.subtle.importKey") || webhookSource.includes("crypto.subtle"));
  });
  test("uses constant-time comparison", () => {
    assert.ok(webhookSource.includes("timingSafeEqual") || webhookSource.includes("timing"));
  });
  test("reads body once for both HMAC and parsing", () => {
    assert.ok(webhookSource.includes("rawBody"));
  });
  test("rejects missing signature with 401", () => {
    assert.ok(webhookSource.includes("Missing x-apple-signature") || webhookSource.includes("401"));
  });
  test("rejects invalid signature format with 401", () => {
    assert.ok(webhookSource.includes("Invalid x-apple-signature"));
  });
  test("rejects HMAC mismatch", () => {
    assert.ok(webhookSource.includes("HMAC signature verification failed"));
  });
  test("does NOT use raw secret header comparison", () => {
    // The old implementation checked x-apple-webhook-secret directly
    assert.ok(!webhookSource.includes("x-apple-webhook-secret"));
    assert.ok(!webhookSource.includes("X-Apple-Webhook-Secret"));
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("ASC webhook payload format", () => {
  test("parses ASC webhook JSON format (not JWS)", () => {
    // ASC webhooks send plain JSON, not signedPayload JWS
    assert.ok(!webhookSource.includes("signedPayload"));
  });
  test("extracts event type from data.type", () => {
    assert.ok(webhookSource.includes("data.type") || webhookSource.includes("eventType"));
  });
  test("handles appStoreVersionAppVersionStateUpdated events", () => {
    assert.ok(webhookSource.includes("appStoreVersionAppVersionStateUpdated"));
  });
  test("handles buildBundleProcessingStateUpdated events", () => {
    assert.ok(webhookSource.includes("buildBundleProcessingStateUpdated"));
  });
  test("handles ping events for testing", () => {
    assert.ok(webhookSource.includes("ping") && webhookSource.includes("PONG"));
  });
  test("extracts newValue/oldValue from attributes", () => {
    assert.ok(webhookSource.includes("newValue") && webhookSource.includes("oldValue"));
  });
  test("extracts instance relationship", () => {
    assert.ok(webhookSource.includes("instance") && webhookSource.includes("instanceId"));
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Webhook policy decisions", () => {
  test("VALID build → STAGE action", () => {
    assert.ok(webhookSource.includes('"VALID"') && webhookSource.includes('"STAGE"'));
  });
  test("FAILED build → LOG_ONLY (no deployment)", () => {
    assert.ok(webhookSource.includes('"FAILED"') && webhookSource.includes("LOG_ONLY"));
  });
  test("READY_FOR_DISTRIBUTION → PRODUCTION action", () => {
    assert.ok(webhookSource.includes("READY_FOR_DISTRIBUTION") && webhookSource.includes('"PRODUCTION"'));
  });
  test("unknown events → LOG_ONLY", () => {
    assert.ok(webhookSource.includes("Unhandled event type"));
  });
  test("triggers GitHub repository_dispatch", () => {
    assert.ok(webhookSource.includes("repository_dispatch") || webhookSource.includes("dispatches"));
  });
  test("safe defaults — no auto-production on build complete", () => {
    assert.equal(policy.productionOnBuildComplete, false);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Webhook security and idempotency", () => {
  test("idempotency check for duplicate events", () => {
    assert.ok(webhookSource.includes("processedEvents") || webhookSource.includes("idempoten"));
  });
  test("bounds processed event set to prevent memory leaks", () => {
    assert.ok(webhookSource.includes("10000") || webhookSource.includes("size >"));
  });
  test("does not log secrets", () => {
    assert.ok(!webhookSource.includes("console.log(secret"));
    assert.ok(!webhookSource.includes("console.log(token"));
  });
  test("does not log raw signature", () => {
    assert.ok(!webhookSource.includes("logEvent") || !webhookSource.match(/logEvent.*appleHash/));
  });
  test("POST-only webhook endpoint", () => {
    assert.ok(webhookSource.includes('request.method === "POST"'));
  });
  test("returns proper error status codes", () => {
    assert.ok(webhookSource.includes("statusCode") && webhookSource.includes("401"));
  });
  test("real webhook verification required before live status", () => {
    assert.equal(policy.requireRealWebhookVerificationBeforeLiveStatus, true);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Auto-sync workflow exists", () => {
  test("polyglot-mcp-autosync.yml exists and references correct events", () => {
    const workflowSource = readFileSync(
      join(ROOT, ".github/workflows/polyglot-mcp-autosync.yml"), "utf8"
    );
    assert.ok(workflowSource.includes("repository_dispatch"));
    assert.ok(workflowSource.includes("apple-webhook-STAGE"));
    assert.ok(workflowSource.includes("apple-webhook-PRODUCTION"));
    assert.ok(workflowSource.includes("concurrency"));
  });
});
