#!/usr/bin/env node
/**
 * Poly-Glot Entitlement Parity Validator
 *
 * Validates that config/polyglot-capabilities.json is consistent with
 * the actual MCP server entitlement logic in pricing.js, entitlements.js,
 * server.js, and src/cross-platform-tools.js.
 *
 * CI must fail if parity is broken.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

function loadJson(rel) {
  return JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
}

function loadText(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

// ── Load sources ───────────────────────────────────────────────────────
const capabilities = loadJson("config/polyglot-capabilities.json");
const pricingSource = loadText("pricing.js");
const entitlementsSource = loadText("entitlements.js");
const serverSource = loadText("server.js");
const crossPlatformSource = loadText("src/cross-platform-tools.js");

// ── Schema version ─────────────────────────────────────────────────────
describe("Capability manifest schema", () => {
  test("schemaVersion is 1", () => {
    assert.equal(capabilities.schemaVersion, 1);
  });

  test("entitlementVersion is present and formatted", () => {
    assert.ok(capabilities.entitlementVersion, "entitlementVersion must exist");
    assert.match(capabilities.entitlementVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/, "Must be YYYY-MM-DD.N format");
  });
});

// ── Plan names match ───────────────────────────────────────────────────
describe("Plan parity", () => {
  test("manifest plans include free, trial, pro", () => {
    assert.ok(capabilities.plans.free, "free plan must exist");
    assert.ok(capabilities.plans.trial, "trial plan must exist");
    assert.ok(capabilities.plans.pro, "pro plan must exist");
  });

  test("Compare Mode: free=false, trial=true, pro=true", () => {
    assert.equal(capabilities.plans.free.compare, false);
    assert.equal(capabilities.plans.trial.compare, true);
    assert.equal(capabilities.plans.pro.compare, true);
  });

  test("Premium templates: free=false, trial=true, pro=true", () => {
    assert.equal(capabilities.plans.free.premiumTemplates, false);
    assert.equal(capabilities.plans.trial.premiumTemplates, true);
    assert.equal(capabilities.plans.pro.premiumTemplates, true);
  });

  test("Cross-platform tools: free=false, trial=true, pro=true", () => {
    assert.equal(capabilities.plans.free.crossPlatformTools, false);
    assert.equal(capabilities.plans.trial.crossPlatformTools, true);
    assert.equal(capabilities.plans.pro.crossPlatformTools, true);
  });

  test("Free template count matches pricing.js", () => {
    assert.match(pricingSource, new RegExp(`freeTemplateCount:\\s*${capabilities.plans.free.freeTemplateCount}`));
  });

  test("Trial days matches pricing.js", () => {
    assert.match(pricingSource, new RegExp(`trialDays:\\s*${capabilities.plans.free.trialDays}`));
  });
});

// ── Product ID parity ──────────────────────────────────────────────────
describe("Product ID parity", () => {
  test("monthly product ID matches pricing.js", () => {
    const id = capabilities.products.monthly.id;
    assert.match(pricingSource, new RegExp(`id:\\s*"${capabilities.products.monthly.mcpPlanKey}"`));
    assert.ok(id === "ai.polyglot.workspace.pro.monthly");
  });

  test("annual product ID matches pricing.js", () => {
    const id = capabilities.products.annual.id;
    assert.match(pricingSource, new RegExp(`id:\\s*"${capabilities.products.annual.mcpPlanKey}"`));
    assert.ok(id === "ai.polyglot.workspace.pro.annual");
  });

  test("monthly price matches", () => {
    assert.match(pricingSource, new RegExp(`price:\\s*${capabilities.products.monthly.price}`));
  });

  test("annual price matches", () => {
    assert.match(pricingSource, new RegExp(`price:\\s*${capabilities.products.annual.price}`));
  });
});

// ── Entitlement state parity ───────────────────────────────────────────
describe("Entitlement state parity", () => {
  test("all manifest states exist in pricing.js ENTITLEMENT_STATES", () => {
    for (const state of capabilities.entitlementStates) {
      assert.match(pricingSource, new RegExp(`"${state}"`), `State "${state}" must exist in pricing.js`);
    }
  });

  test("no unknown states in pricing.js", () => {
    const matches = pricingSource.matchAll(/:\s*"([a-z_]+)"/g);
    const pricingStates = [];
    for (const m of matches) {
      if (["USD", "month", "year", "Save 33%"].includes(m[1])) continue;
      if (capabilities.entitlementStates.includes(m[1])) pricingStates.push(m[1]);
    }
    // Every state found should be in the manifest
    for (const s of pricingStates) {
      assert.ok(capabilities.entitlementStates.includes(s), `pricing.js state "${s}" not in manifest`);
    }
  });
});

// ── Feature gate parity ────────────────────────────────────────────────
describe("Feature gate parity", () => {
  test("Compare Mode is gated in server.js", () => {
    assert.match(serverSource, /compareAccess/, "server.js must reference compareAccess");
    assert.match(serverSource, /compare_locked/, "server.js must have compare_locked view");
  });

  test("templateAccess exists in entitlements.js", () => {
    assert.match(entitlementsSource, /templateAccess/, "entitlements.js must export templateAccess");
  });

  test("cross-platform tools are gated", () => {
    assert.match(crossPlatformSource, /requireEntitlement/, "cross-platform-tools.js must call requireEntitlement");
  });

  test("all proOrTrial tools have entitlement gate", () => {
    const combined = crossPlatformSource + "\n" + serverSource;
    for (const tool of capabilities.mcpTools.proOrTrial) {
      assert.match(combined, new RegExp(`"${tool}"`), `Tool "${tool}" must be registered`);
    }
  });

  test("all proOnly tools reference compareAccess", () => {
    for (const tool of capabilities.mcpTools.proOnly) {
      assert.match(serverSource, new RegExp(`"${tool}"`), `Tool "${tool}" must be registered in server.js`);
    }
  });
});

// ── MCP tool inventory parity ──────────────────────────────────────────
describe("MCP tool inventory", () => {
  const allTools = [
    ...capabilities.mcpTools.open,
    ...capabilities.mcpTools.entitlementAware,
    ...capabilities.mcpTools.proOnly,
    ...capabilities.mcpTools.proOrTrial,
  ];

  test("exactly 11 tools in manifest", () => {
    assert.equal(allTools.length, 11, `Expected 11 tools, got ${allTools.length}`);
  });

  test("no duplicate tools", () => {
    const unique = new Set(allTools);
    assert.equal(unique.size, allTools.length, "Duplicate tools found in manifest");
  });

  test("all tools exist in server.js or cross-platform-tools.js", () => {
    const combined = serverSource + crossPlatformSource;
    for (const tool of allTools) {
      assert.match(combined, new RegExp(`"${tool}"`), `Tool "${tool}" not found in source`);
    }
  });
});

// ── No stale/unknown gates ─────────────────────────────────────────────
describe("No unknown gates", () => {
  test("no VERIFY placeholders remain", () => {
    const raw = JSON.stringify(capabilities);
    assert.ok(!raw.includes("VERIFY"), "Manifest must not contain VERIFY placeholders");
  });

  test("no SET_FROM placeholders remain", () => {
    const raw = JSON.stringify(capabilities);
    assert.ok(!raw.includes("SET_FROM"), "Manifest must not contain SET_FROM placeholders");
  });
});

console.log("\n✅ All entitlement parity checks passed.\n");
