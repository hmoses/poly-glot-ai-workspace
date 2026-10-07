#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test, describe } from "node:test";
import assert from "node:assert/strict";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const loadJson = (p) => JSON.parse(readFileSync(join(ROOT, p), "utf8"));
const loadText = (p) => readFileSync(join(ROOT, p), "utf8");

const caps = loadJson("config/polyglot-capabilities.json");
const pricing = loadText("pricing.js");
const entitlements = loadText("entitlements.js");
const server = loadText("server.js");
const cross = loadText("src/cross-platform-tools.js");
const localization = loadText("localization.js");

const groups = caps.mcpTools;
const allTools = [
  ...groups.open,
  ...groups.readOnly_entitlementAware,
  ...groups.sendActions,
  ...groups.proOrTrial,
];

describe("Capability manifest", () => {
  test("schema and version are current", () => {
    assert.equal(caps.schemaVersion, 2);
    assert.match(caps.entitlementVersion, /^\d{4}-\d{2}-\d{2}\.\d+$/);
  });
  test("15 unique tools are declared", () => {
    assert.equal(allTools.length, 15);
    assert.equal(new Set(allTools).size, 15);
  });
  test("38 languages and 9 providers are declared", () => {
    assert.equal(caps.languageCount, 38);
    assert.equal(caps.providers.length, 9);
  });
});

describe("Plan parity", () => {
  test("trial unlocks compare, premium templates and cross-platform tools", () => {
    assert.equal(caps.plans.trial.compare, true);
    assert.equal(caps.plans.trial.premiumTemplates, true);
    assert.equal(caps.plans.trial.crossPlatformTools, true);
  });
  test("free plan is rolling-24-hour limited", () => {
    assert.equal(caps.plans.free.dailyFreeSends, 1);
    assert.equal(caps.plans.free.freeSendWindowHours, 24);
    assert.match(entitlements, /lastFreeSendAt/);
    assert.match(entitlements, /consumeDailyFreeSend/);
  });
  test("prices and trial days match pricing.js", () => {
    assert.match(pricing, new RegExp(`trialDays:\\s*${caps.plans.free.trialDays}`));
    assert.match(pricing, new RegExp(`price:\\s*${caps.products.monthly.price}`));
    assert.match(pricing, new RegExp(`price:\\s*${caps.products.annual.price}`));
  });
});

describe("Runtime gates", () => {
  test("template and compare gates exist", () => {
    assert.match(entitlements, /templateAccess/);
    assert.match(server, /compareAccess/);
  });
  test("all declared tools are registered", () => {
    const combined = server + "\n" + cross;
    for (const tool of allTools) assert.ok(combined.includes(`"${tool}"`), `Missing tool ${tool}`);
  });
  test("Pro-or-trial tools are gated", () => {
    assert.match(cross, /requireEntitlement/);
    assert.match(server, /Validating custom model endpoints requires an active trial or Pro subscription/);
    assert.match(server, /Running custom models requires an active trial or Pro subscription/);
  });
});

describe("Language and provider parity", () => {
  test("backend language list exposes 38 product languages", () => {
    for (const code of ["BN","AF","AM","HA","SW"]) assert.ok(localization.includes(`["${code}"`));
    for (const code of ["BG","LT","LV","ET"]) assert.ok(!localization.includes(`["${code}"`));
  });
  test("Compare Mode exposes all 9 providers", () => {
    for (const id of caps.providers) assert.ok(server.includes(`${id}:`) || server.includes(`"${id}"`), `Provider ${id} missing`);
  });
});

console.log("\n✅ Entitlement parity checks passed.\n");
