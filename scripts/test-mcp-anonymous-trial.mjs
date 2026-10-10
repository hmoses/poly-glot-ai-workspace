/**
 * MCP entitlement regression tests. The entitlement API responses are mocked;
 * production issuer/JWT signature validation still requires deployment testing.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

// This test mocks the remote entitlement API; no database connection is used.
// Provide an unreachable, test-only URL so importing the production route module
// does not require a real Neon secret in CI. Any unexpected DB query fails closed.
process.env.DATABASE_URL ||= "postgresql://ci:ci@127.0.0.1:1/polyglot_test";
process.env.NODE_ENV = "production";
process.env.POLYGLOT_ENTITLEMENT_ENDPOINT = "https://entitlements.example.test/v1/entitlements/me";
delete process.env.POLYGLOT_TRIAL_START_ENDPOINT; // Test derived fallback URL.

const { createPolyglotServer } = await import("../server.js");

let accountState = "not_started";
let trialStartedAt = null;
let trialEndsAt = null;
let posts = 0;
let lookups = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options = {}) => {
  const target = String(url);
  const method = String(options.method || "GET").toUpperCase();
  const token = String(options.headers?.authorization || "");
  if (!token.includes("valid-test-token")) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  if (target.endsWith("/v1/entitlements/me") && method === "GET") {
    lookups++;
    return Response.json({
      state: accountState, userId: "test-subject",
      trialStartedAt, trialEndsAt, lastFreeSendAt: null,
    });
  }
  if (target.endsWith("/v1/trials/start") && method === "POST") {
    posts++;
    accountState = "trial";
    trialStartedAt = new Date().toISOString();
    trialEndsAt = new Date(Date.now() + 3 * 86400000).toISOString();
    return Response.json({ state: accountState, userId: "test-subject", trialStartedAt, trialEndsAt });
  }
  return Response.json({ error: "unexpected endpoint" }, { status: 404 });
};

async function connect(token = "") {
  const server = createPolyglotServer(token);
  const client = new Client({ name: "security-regression", version: "1.0.0" });
  const [serverTransport, clientTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return { client, server };
}
async function send(client, name, args = {}) {
  return client.callTool({ name, arguments: args });
}

test("anonymous clients can browse but cannot Send or start a trial", async () => {
  const { client, server } = await connect();
  try {
    const languages = await send(client, "get_language_options");
    assert.equal(languages.structuredContent?.view, "languages");
    const catalog = await send(client, "search_templates", { plan: "free", limit: 24 });
    assert.equal(catalog.structuredContent?.view, "search");
    const freeTemplate = catalog.structuredContent.results.find(t => t.plan === "free");
    assert.ok(freeTemplate, "test requires at least one free template");
    const prompt = await send(client, "build_prompt", { name: freeTemplate.id, values: {} });
    assert.equal(prompt.structuredContent?.view, "locked");
    assert.equal(prompt.structuredContent?.prompt, undefined);
    assert.match(prompt.structuredContent.message, /sign in/i);
    const compare = await send(client, "prepare_compare", { prompt: "Hello", providers: ["chatgpt", "claude"] });
    assert.equal(compare.structuredContent?.view, "locked");
    assert.equal(compare.structuredContent?.prompt, undefined);
    const custom = await send(client, "prepare_custom_compare", {
      prompt: "Hello", builtinProviders: ["chatgpt"],
      customModels: [{ label: "Custom", adapterMode: "openai-compatible", baseUrl: "https://models.example.test" }],
    });
    assert.equal(custom.structuredContent?.view, "locked");
    assert.equal(posts, 0, "anonymous clients must not start trials");
    assert.equal(lookups, 0, "anonymous clients must not create account state");
  } finally { await client.close(); await server.close(); }
});

test("authenticated first Send starts a persisted trial and unlocks the prompt", async () => {
  accountState = "not_started";
  posts = 0;
  lookups = 0;
  const { client, server } = await connect("valid-test-token");
  try {
    const catalog = await send(client, "search_templates", { plan: "free", limit: 24 });
    const freeTemplate = catalog.structuredContent.results.find(t => t.plan === "free");
    assert.ok(freeTemplate);
    const prompt = await send(client, "build_prompt", { name: freeTemplate.id, values: {} });
    assert.equal(prompt.structuredContent?.view, "prompt");
    assert.equal(prompt.structuredContent?.entitlement?.trialActive, true);
    assert.equal(posts, 1, "trial start should be persisted exactly once");
    assert.ok(lookups >= 2, "account state must be checked again after trial activation");
    const status = await send(client, "get_subscription_status");
    assert.equal(status.structuredContent?.entitlement?.trialActive, true);
  } finally { await client.close(); await server.close(); }
});

test("invalid bearer token cannot obtain the pre-trial send bypass", async () => {
  const { client, server } = await connect("not-valid-token");
  try {
    const catalog = await send(client, "search_templates", { plan: "free", limit: 24 });
    assert.equal(catalog.isError, true, "entitlement server should reject invalid identity");
  } finally { await client.close(); await server.close(); }
});

test.after(() => { globalThis.fetch = originalFetch; });
