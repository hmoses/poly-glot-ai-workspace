#!/usr/bin/env node
/**
 * Generate Swift constants from config/polyglot-capabilities.json.
 *
 * Output: Generated/PolyGlotCapabilities.swift
 *
 * This file is deterministic — identical input always produces identical output.
 * CI should fail if the generated file is stale (run with --check flag).
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
// Use parity contract if available, fall back to capabilities
const PARITY_PATH = join(ROOT, "config", "polyglot-product-parity.json");
const CAPS_PATH = join(ROOT, "config", "polyglot-capabilities.json");
const INPUT = existsSync(PARITY_PATH) ? PARITY_PATH : CAPS_PATH;
const OUTPUT = join(ROOT, "Generated", "PolyGlotCapabilities.swift");

const capabilities = JSON.parse(readFileSync(INPUT, "utf8"));
const checkOnly = process.argv.includes("--check");

function swift() {
  const lines = [];
  const w = (s = "") => lines.push(s);

  w("// ──────────────────────────────────────────────────────────────────────");
  w("// AUTO-GENERATED — do not edit manually.");
  w("// Source: config/polyglot-capabilities.json");
  const version = capabilities.entitlementVersion || capabilities.parityVersion;
  w(`// Entitlement version: ${version}`);
  w("// Run: node scripts/generate-apple-capabilities.mjs");
  w("// ──────────────────────────────────────────────────────────────────────");
  w();
  w("import Foundation");
  w();
  w("/// Machine-generated capability constants for Poly-Glot iOS/macOS.");
  w("/// Kept in sync with the MCP server via CI parity checks.");
  w("enum PolyGlotCapabilities {");
  w();
  w(`    static let entitlementVersion = "${version}"`);
  w(`    static let schemaVersion = ${capabilities.schemaVersion}`);
  w();

  // Products
  w("    // MARK: - Products");
  w();
  w("    enum Products {");
  w(`        static let monthlyId = "${capabilities.products.monthly.id}"`);
  w(`        static let annualId  = "${capabilities.products.annual.id}"`);
  w(`        static let all: [String] = [monthlyId, annualId]`);
  w(`        static let monthlyPrice: Decimal = ${capabilities.products.monthly.price}`);
  w(`        static let annualPrice: Decimal  = ${capabilities.products.annual.price}`);
  w("    }");
  w();

  // Plans
  w("    // MARK: - Plans");
  w();
  for (const [plan, config] of Object.entries(capabilities.plans)) {
    const name = plan.charAt(0).toUpperCase() + plan.slice(1);
    w(`    enum ${name}Plan {`);
    w(`        static let compare = ${config.compare}`);
    w(`        static let premiumTemplates = ${config.premiumTemplates}`);
    w(`        static let crossPlatformTools = ${config.crossPlatformTools}`);
    w(`        static let freeTemplateCount = ${config.freeTemplateCount}`);
    if (config.trialDays !== undefined) {
      w(`        static let trialDays = ${config.trialDays}`);
    }
    w("    }");
    w();
  }

  // Entitlement states
  w("    // MARK: - Entitlement States");
  w();
  w("    enum EntitlementState: String, CaseIterable {");
  for (const state of capabilities.entitlementStates) {
    const caseName = state.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    w(`        case ${caseName} = "${state}"`);
  }
  w("    }");
  w();

  // Features
  w("    // MARK: - Features");
  w();
  w("    enum Features {");
  for (const [feat, value] of Object.entries(capabilities.features)) {
    // Parity contract uses objects { visible, freeAccess, proAccess, ... }
    // Capabilities contract uses simple booleans
    const enabled = typeof value === "boolean" ? value : (value.visible ?? true);
    w(`        static let ${feat} = ${enabled}`);
  }
  w("    }");
  w("}");
  w();

  return lines.join("\n");
}

const generated = swift();

if (checkOnly) {
  try {
    const existing = readFileSync(OUTPUT, "utf8");
    if (existing === generated) {
      console.log("✅ Generated/PolyGlotCapabilities.swift is up to date.");
      process.exit(0);
    } else {
      console.error("❌ Generated/PolyGlotCapabilities.swift is stale. Run: node scripts/generate-apple-capabilities.mjs");
      process.exit(1);
    }
  } catch {
    console.error("❌ Generated/PolyGlotCapabilities.swift does not exist. Run: node scripts/generate-apple-capabilities.mjs");
    process.exit(1);
  }
} else {
  writeFileSync(OUTPUT, generated, "utf8");
  console.log(`✅ Generated: ${OUTPUT}`);
}
