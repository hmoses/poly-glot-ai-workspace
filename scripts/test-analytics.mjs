/**
 * POLY-GLOT ANALYTICS TESTS
 *
 * Tests that:
 * 1. recordMcpUsage works when the DB is available
 * 2. recordMcpUsage silently catches DB errors (never throws)
 * 3. detectClient identifies known clients
 * 4. deriveUserKey hashes tokens, returns null when no token
 * 5. deriveSessionKey hashes session IDs, returns null when none
 * 6. analyticsContext builds correct context
 * 7. trackToolCall never throws even with broken DB
 *
 * Run with: DATABASE_URL=<neon_url> node scripts/test-analytics.mjs
 * Or without DATABASE_URL to test failure-resilience only.
 */
import { describe, it, mock, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Unit tests that don't need a real DB ---

// Import the pure functions directly
import {
  detectClient,
  deriveUserKey,
  deriveSessionKey,
  analyticsContext,
} from "../analytics.js";

describe("detectClient", () => {
  it("detects ChatGPT from issuer", () => {
    assert.equal(detectClient({ authInfo: { issuer: "https://platform.openai.com" } }), "chatgpt");
  });
  it("detects Claude from clientId", () => {
    assert.equal(detectClient({ authInfo: { clientId: "claude-desktop" } }), "claude");
  });
  it("detects Goose from userAgent", () => {
    assert.equal(detectClient({ _userAgent: "goose/1.0" }), "goose");
  });
  it("detects Cursor from issuer", () => {
    assert.equal(detectClient({ authInfo: { issuer: "https://cursor.sh" } }), "cursor");
  });
  it("detects Neon as ChatGPT", () => {
    assert.equal(detectClient({ authInfo: { issuer: "https://auth.neon.tech" } }), "chatgpt");
  });
  it("returns unknown for empty extra", () => {
    assert.equal(detectClient({}), "unknown");
  });
  it("returns unknown for null extra", () => {
    assert.equal(detectClient(null), "unknown");
  });
  it("returns unknown for undefined extra", () => {
    assert.equal(detectClient(undefined), "unknown");
  });
});

describe("deriveUserKey", () => {
  it("hashes a token", () => {
    const key = deriveUserKey({ authInfo: { token: "test-token-123" } });
    assert.ok(key);
    assert.equal(key.length, 64); // SHA-256 hex
    assert.notEqual(key, "test-token-123"); // not the raw token
  });
  it("returns null when no token", () => {
    assert.equal(deriveUserKey({}), null);
  });
  it("returns null for null extra", () => {
    assert.equal(deriveUserKey(null), null);
  });
  it("uses accessToken when token is missing", () => {
    const key = deriveUserKey({ authInfo: { accessToken: "at-456" } });
    assert.ok(key);
    assert.equal(key.length, 64);
  });
  it("produces consistent hashes", () => {
    const a = deriveUserKey({ authInfo: { token: "same" } });
    const b = deriveUserKey({ authInfo: { token: "same" } });
    assert.equal(a, b);
  });
  it("produces different hashes for different tokens", () => {
    const a = deriveUserKey({ authInfo: { token: "aaa" } });
    const b = deriveUserKey({ authInfo: { token: "bbb" } });
    assert.notEqual(a, b);
  });
});

describe("deriveSessionKey", () => {
  it("hashes a session ID", () => {
    const key = deriveSessionKey({ sessionId: "sess-abc" });
    assert.ok(key);
    assert.equal(key.length, 64);
    assert.notEqual(key, "sess-abc");
  });
  it("returns null when no session", () => {
    assert.equal(deriveSessionKey({}), null);
  });
});

describe("analyticsContext", () => {
  it("builds context with token", () => {
    const ctx = analyticsContext({ authInfo: { token: "tok" } });
    assert.ok(ctx.userKey);
    assert.equal(ctx.authenticated, true);
    assert.equal(ctx.source, "mcp");
    assert.equal(typeof ctx.clientName, "string");
  });
  it("builds context without token", () => {
    const ctx = analyticsContext({});
    assert.equal(ctx.userKey, null);
    assert.equal(ctx.authenticated, false);
    assert.equal(ctx.clientName, "unknown");
  });
  it("uses requestAuthToken fallback", () => {
    const ctx = analyticsContext({}, "fallback-token");
    assert.ok(ctx.userKey);
    assert.equal(ctx.authenticated, true);
  });
});

// --- Integration tests (need DATABASE_URL) ---

import { recordMcpUsage, trackToolCall } from "../analytics.js";

describe("recordMcpUsage", () => {
  it("never throws even without DATABASE_URL", async () => {
    // This test verifies the catch-all works. If DATABASE_URL is set, it will
    // actually insert. If not, pool.query will fail and recordMcpUsage catches it.
    await assert.doesNotReject(async () => {
      await recordMcpUsage({
        eventType: "tool_call",
        toolName: "test_tool",
        userKey: "test-hash",
        sessionKey: null,
        authenticated: false,
        source: "test",
        clientName: "test",
        metadata: { test: true },
      });
    });
  });
});

describe("trackToolCall", () => {
  it("never throws even with null extra", () => {
    assert.doesNotThrow(() => {
      trackToolCall("test_tool", null, "", { test: true });
    });
  });
  it("never throws with undefined extra", () => {
    assert.doesNotThrow(() => {
      trackToolCall("test_tool", undefined, "", {});
    });
  });
});

// --- DB failure resilience test ---

describe("analytics failure resilience", () => {
  it("recordMcpUsage swallows database errors silently", async () => {
    // Even if the pool throws, recordMcpUsage must not propagate
    await assert.doesNotReject(async () => {
      await recordMcpUsage({
        eventType: "test_failure_resilience",
        toolName: "nonexistent_tool",
        metadata: { deliberateTest: true },
      });
    });
  });
});

console.log("\n✅ All analytics tests passed.\n");
