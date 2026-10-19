/**
 * POLY-GLOT APPLE PURCHASE VERIFICATION
 * GOOSE NOTE: Apple-signed JWS verification is authoritative for StoreKit state.
 * Keep certificate-chain/signature verification on the server. Never trust a
 * transaction payload supplied by the Mac app until its JWS is verified.
 */
import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";

const bundleId = process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
const appAppleId = Number(process.env.APPLE_APP_ID || "6804499285");
function rootCertificates() {
  const paths = String(process.env.APPLE_ROOT_CA_PATHS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (paths.length) return paths.map(p => new X509Certificate(readFileSync(p)).raw);

  // Neon Functions deploys have no writable certificate filesystem. The
  // existing APPLE_ROOT_CA_B64 secret holds trusted Apple root certificate
  // bytes; accept both DER and PEM, validating every certificate on startup.
  const encoded = String(process.env.APPLE_ROOT_CA_B64 || "").trim();
  if (!encoded) throw new Error("APPLE_ROOT_CA_PATHS or APPLE_ROOT_CA_B64 is required");
  const certs = [];
  for (const item of encoded.split(",").map(x => x.replace(/\s+/g, "")).filter(Boolean)) {
    const bytes = Buffer.from(item, "base64");
    if (!bytes.length) throw new Error("Invalid Apple certificate base64");
    const pem = bytes.toString("utf8").match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g);
    for (const cert of pem || [bytes]) certs.push(new X509Certificate(cert).raw);
  }
  return certs;
}

// Production and Apple sandbox transactions are both Apple-signed JWS.
// Xcode/local-testing transactions are never eligible for server access.
const supportedEnvironments = [Environment.PRODUCTION, Environment.SANDBOX];
const verifiers = new Map();

export function appleVerifier(environment = Environment.PRODUCTION) {
  if (!supportedEnvironments.includes(environment)) {
    throw Object.assign(new Error("Unsupported Apple environment"), {statusCode: 400});
  }
  if (!verifiers.has(environment)) {
    verifiers.set(environment, new SignedDataVerifier(
      rootCertificates(),
      process.env.APPLE_ONLINE_CHECKS !== "false",
      environment,
      bundleId,
      environment === Environment.PRODUCTION ? appAppleId : undefined,
    ));
  }
  return verifiers.get(environment);
}

/**
 * The payload's environment is only a verifier-selection hint, NEVER proof of
 * purchase. The selected Apple verifier independently validates the entire JWS,
 * Apple certificate chain, bundle ID, and signed environment value.
 */
export function signedEnvironment(signedPayload) {
  if (typeof signedPayload !== "string" || signedPayload.length > 200000 || signedPayload.split(".").length !== 3) {
    throw Object.assign(new Error("Invalid Apple signed payload"), {statusCode: 400});
  }
  let decoded;
  try {
    decoded = JSON.parse(Buffer.from(signedPayload.split(".")[1], "base64url").toString("utf8"));
  } catch {
    throw Object.assign(new Error("Malformed Apple signed payload"), {statusCode: 400});
  }
  const environmentHint = decoded.environment || decoded.data?.environment;
  if (!supportedEnvironments.includes(environmentHint)) {
    throw Object.assign(new Error("Unsupported Apple signed environment"), {statusCode: 400});
  }
  return environmentHint;
}

export async function verifyTransaction(signedTransaction) {
  const tx = await appleVerifier(signedEnvironment(signedTransaction)).verifyAndDecodeTransaction(signedTransaction);
  tx.__signed = signedTransaction;
  return tx;
}

export async function verifyNotification(signedPayload) {
  return appleVerifier(signedEnvironment(signedPayload)).verifyAndDecodeNotification(signedPayload);
}

export async function transactionFromNotification(notification) {
  const signed = notification?.data?.signedTransactionInfo;
  if (!signed) return null;
  return verifyTransaction(signed);
}
