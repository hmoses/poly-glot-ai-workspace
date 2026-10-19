/** Apple StoreKit JWS environment routing; no customer data or real purchases. */
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Supply a throwaway trust anchor to make sure fake signed data is rejected
// by Apple's verifier, rather than only failing because certificates are absent.
const dir = mkdtempSync(join(tmpdir(), "polyglot-apple-jws-test-"));
const key = join(dir, "key.pem");
const cert = join(dir, "cert.pem");
execFileSync("openssl", [
  "req", "-x509", "-newkey", "rsa:2048", "-nodes",
  "-keyout", key, "-out", cert, "-days", "1", "-subj", "/CN=TestOnly",
], {stdio:"ignore"});
process.env.APPLE_ROOT_CA_PATHS = cert;
process.env.APPLE_ONLINE_CHECKS = "false";
const { signedEnvironment, appleVerifier, verifyTransaction, verifyNotification } = await import("../entitlement-service/apple.js");
const token = (payload) => [
  Buffer.from(JSON.stringify({alg:"HS256",typ:"JWT"})).toString("base64url"),
  Buffer.from(JSON.stringify(payload)).toString("base64url"),
  "invalid-signature",
].join(".");

test("environment selectors accept only production and Apple sandbox", () => {
  assert.equal(signedEnvironment(token({environment:"Production"})), "Production");
  assert.equal(signedEnvironment(token({environment:"Sandbox"})), "Sandbox");
  assert.equal(signedEnvironment(token({data:{environment:"Sandbox"}})), "Sandbox");
  for (const environment of ["Xcode", "LocalTesting", "development", "", "Prod", null]) {
    assert.throws(() => signedEnvironment(token({environment})), /Unsupported Apple signed environment/);
  }
  assert.throws(() => signedEnvironment("not-a-JWS"), /Invalid Apple signed payload/);
  assert.throws(() => signedEnvironment("a.!.b"), /Malformed Apple signed payload/);
  assert.throws(() => appleVerifier("Xcode"), /Unsupported Apple environment/);
});

test("production and sandbox verifiers enforce separate signed environments", () => {
  assert.equal(appleVerifier("Production").environment, "Production");
  assert.equal(appleVerifier("Sandbox").environment, "Sandbox");
  assert.equal(appleVerifier("Production").bundleId, "ai.polyglot.workspace");
  assert.equal(appleVerifier("Sandbox").bundleId, "ai.polyglot.workspace");
});

test("forged production and sandbox transactions and notifications never unlock", async () => {
  for (const environment of ["Production", "Sandbox"]) {
    await assert.rejects(
      verifyTransaction(token({environment,bundleId:"ai.polyglot.workspace",productId:"ai.polyglot.workspace.pro.annual"}))
    );
    await assert.rejects(
      verifyNotification(token({data:{environment,bundleId:"ai.polyglot.workspace"}}))
    );
  }
});

test.after(() => rmSync(dir, {recursive:true,force:true}));
