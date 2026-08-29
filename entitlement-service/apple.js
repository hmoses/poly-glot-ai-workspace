/**
 * POLY-GLOT APPLE PURCHASE VERIFICATION
 * GOOSE NOTE: Apple-signed JWS verification is authoritative for StoreKit state.
 * Keep certificate-chain/signature verification on the server. Never trust a
 * transaction payload supplied by the Mac app until its JWS is verified.
 */
import { readFileSync } from "node:fs";
import { Environment, SignedDataVerifier } from "@apple/app-store-server-library";

const bundleId = process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
const appAppleId = Number(process.env.APPLE_APP_ID || "6804499285");
const mode = String(process.env.APPLE_ENVIRONMENT || "PRODUCTION").toUpperCase();
const environment = mode === "SANDBOX" ? Environment.SANDBOX : Environment.PRODUCTION;

function rootCertificates() {
  const paths = String(process.env.APPLE_ROOT_CA_PATHS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!paths.length) throw new Error("APPLE_ROOT_CA_PATHS is required; point it at Apple Root CA certificate files");
  return paths.map(p => readFileSync(p));
}

let verifier;
export function appleVerifier() {
  verifier ||= new SignedDataVerifier(
    rootCertificates(),
    process.env.APPLE_ONLINE_CHECKS !== "false",
    environment,
    bundleId,
    environment === Environment.PRODUCTION ? appAppleId : undefined,
  );
  return verifier;
}

export async function verifyTransaction(signedTransaction) {
  const tx = await appleVerifier().verifyAndDecodeTransaction(signedTransaction);
  tx.__signed = signedTransaction;
  return tx;
}

export async function verifyNotification(signedPayload) {
  return appleVerifier().verifyAndDecodeNotification(signedPayload);
}

export async function transactionFromNotification(notification) {
  const signed = notification?.data?.signedTransactionInfo;
  if (!signed) return null;
  return verifyTransaction(signed);
}
