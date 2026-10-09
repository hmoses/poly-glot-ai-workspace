#!/usr/bin/env node
/**
 * Package the actual entitlement-service runtime, INCLUDING installed
 * production dependencies. Neon Functions extracts this ZIP to /opt/function.
 *
 * Usage (Node >=20, npm, zip):
 *   node scripts/package-neon-entitlements.mjs
 *   # output: dist/neon-entitlements.zip
 *
 * This does not deploy or modify any production configuration.
 */
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "entitlement-service");
const output = resolve(root, "dist", "neon-entitlements.zip");
const work = mkdtempSync(resolve(tmpdir(), "polyglot-entitlements-"));
const runtimeFiles = [
  "index.mjs",
  "server.js",
  "apple.js",
  "auth.js",
  "db.js",
  "package.json",
  "package-lock.json",
];

try {
  for (const file of runtimeFiles) {
    const full = resolve(source, file);
    if (!existsSync(full)) throw new Error(`Missing entitlement runtime file: ${file}`);
    cpSync(full, resolve(work, file));
  }

  // npm ci resolves exact package-lock versions; do not use npm install/latest
  // at deploy time because it can change Apple verification behavior.
  execFileSync("npm", ["ci", "--omit=dev", "--ignore-scripts", "--no-audit"], {
    cwd: work, stdio: "inherit"
  });

  // Confirm all runtime imports are actually included in the function package.
  execFileSync(process.execPath, [
    "--input-type=module", "-e",
    "await Promise.all(['jose','pg','@apple/app-store-server-library'].map(n=>import(n))); console.log('Apple entitlement dependencies resolved')"
  ], { cwd: work, stdio: "inherit" });
  for (const file of runtimeFiles.filter(name => name.endsWith(".js") || name.endsWith(".mjs"))) {
    execFileSync(process.execPath, ["--check", file], { cwd: work, stdio: "inherit" });
  }

  mkdirSync(dirname(output), { recursive: true });
  rmSync(output, { force: true });
  execFileSync("zip", ["-q", "-r", output, "."], { cwd: work, stdio: "inherit" });
  console.log(`Built ${output}. Importing jose/pg/Apple library is verified.`);
  console.log("Deployment is a separate explicit operation; no production state changed.");
} finally {
  rmSync(work, { recursive: true, force: true });
}
