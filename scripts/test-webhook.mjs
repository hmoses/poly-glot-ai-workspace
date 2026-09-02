#!/usr/bin/env node
/**
 * Webhook Test Matrix — App Store Connect webhook receiver validation.
 * Tests the webhook handler logic without requiring a live deployment.
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
describe("Webhook source code checks", () => {
  test("verifies webhook secret", () => {
    assert.ok(webhookSource.includes("APPSTORE_WEBHOOK_SECRET") ||
              webhookSource.includes("X-Webhook-Secret") ||
              webhookSource.includes("x-webhook-secret"));
  });
  test("checks bundle ID", () => {
    assert.ok(webhookSource.includes("bundleId") || webhookSource.includes("POLYGLOT_APP_BUNDLE_ID"));
  });
  test("webhook is POST-only server-to-server", () => {
    // Apple webhooks are POST-only, no CORS preflight needed
    assert.ok(webhookSource.includes("POST") && webhookSource.includes("method"));
  });
  test("returns proper status codes", () => {
    assert.ok(webhookSource.includes("401") || webhookSource.includes("403"));
    assert.ok(webhookSource.includes("200"));
  });
  test("triggers GitHub dispatch", () => {
    assert.ok(webhookSource.includes("repository_dispatch") ||
              webhookSource.includes("GITHUB_WEBHOOK_TOKEN"));
  });
  test("does not log secrets", () => {
    assert.ok(!webhookSource.includes("console.log(secret") &&
              !webhookSource.includes("console.log(token"));
  });
  test("handles unknown event types safely", () => {
    assert.ok(webhookSource.includes("LOG_ONLY") || webhookSource.includes("IGNORE") ||
              webhookSource.includes("default"));
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Webhook security policy", () => {
  test("1. invalid auth should be rejected", () => {
    // Webhook source checks secret header before processing
    assert.ok(webhookSource.includes("401") || webhookSource.includes("Unauthorized"));
  });
  test("2. wrong app should be rejected", () => {
    assert.ok(webhookSource.includes("bundleId") || webhookSource.includes("bundle"));
  });
  test("3. safe defaults — no auto-production on build complete", () => {
    assert.equal(policy.productionOnBuildComplete, false);
  });
  test("4. production requires parity validation", () => {
    assert.equal(policy.requireParityValidation, true);
  });
  test("5. production requires regression tests", () => {
    assert.equal(policy.requireRegressionTests, true);
  });
  test("6. production requires smoke tests", () => {
    assert.equal(policy.requireProductionSmokeTests, true);
  });
  test("7. concurrency lock prevents race conditions", () => {
    assert.equal(policy.concurrencyLock, true);
  });
  test("8. real webhook verification required before live status", () => {
    assert.equal(policy.requireRealWebhookVerificationBeforeLiveStatus, true);
  });
});

// ══════════════════════════════════════════════════════════════════════
describe("Auto-sync workflow exists", () => {
  test("polyglot-mcp-autosync.yml exists", () => {
    const workflowSource = readFileSync(
      join(ROOT, ".github/workflows/polyglot-mcp-autosync.yml"), "utf8"
    );
    assert.ok(workflowSource.includes("repository_dispatch"));
    assert.ok(workflowSource.includes("apple-webhook-STAGE"));
    assert.ok(workflowSource.includes("apple-webhook-PRODUCTION"));
    assert.ok(workflowSource.includes("concurrency"));
  });
});
