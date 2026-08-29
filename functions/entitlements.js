/**
 * POLY-GLOT ENTITLEMENT API — NEON FUNCTION
 * Neon Function fetch(request) handler.
 * DATABASE_URL is injected by Neon automatically.
 */
import { Hono } from "hono";
import pg from "pg";

const { Pool } = pg;

// Neon injects DATABASE_URL at runtime — lazy pool creation
let pool;
function getPool() {
  if (!pool) {
    const connStr = process.env.DATABASE_URL;
    if (!connStr) throw new Error("DATABASE_URL is required");
    pool = new Pool({ connectionString: connStr, ssl: { rejectUnauthorized: false }, max: 10 });
  }
  return pool;
}

// --- Product IDs ---
const MONTHLY_IDS = new Set((process.env.POLYGLOT_MONTHLY_PRODUCT_IDS || "ai.polyglot.promptstudio.mac.subscription.monthly,ai.polyglot.workspace.pro.monthly").split(",").map(s => s.trim()).filter(Boolean));
const ANNUAL_IDS = new Set((process.env.POLYGLOT_ANNUAL_PRODUCT_IDS || "ai.polyglot.mac.pro.annual.2704,ai.polyglot.workspace.pro.annual").split(",").map(s => s.trim()).filter(Boolean));
const TRIAL_DAYS = 3;

// --- Identity verification (jose) ---
import { createRemoteJWKSet, jwtVerify } from "jose";

let oidcJwks;
let appleJwks;

function bearer(req) {
  const h = req.header("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

async function verifyMcpUser(c) {
  const token = bearer(c.req);
  // No token = anonymous user (gets not_started entitlement, can browse free templates)
  if (!token) return null;
  const issuer = String(process.env.POLYGLOT_OIDC_ISSUER || "").replace(/\/$/, "");
  const audience = process.env.POLYGLOT_OIDC_AUDIENCE;
  // OIDC not yet configured = treat token as opaque identifier (hash it for subject)
  if (!issuer || !audience) {
    const { createHash } = await import("node:crypto");
    return "token:" + createHash("sha256").update(token).digest("hex");
  }
  const jwksUrl = process.env.POLYGLOT_OIDC_JWKS_URL || `${issuer}/.well-known/jwks.json`;
  oidcJwks ||= createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, oidcJwks, { issuer, audience });
  if (!payload.sub) throw Object.assign(new Error("Token has no subject"), { statusCode: 401 });
  return String(payload.sub);
}

async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken) throw Object.assign(new Error("Apple identity token required"), { statusCode: 401 });
  const audience = process.env.APPLE_SIGN_IN_AUDIENCE || process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
  appleJwks ||= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  const { payload } = await jwtVerify(identityToken, appleJwks, { issuer: "https://appleid.apple.com", audience });
  if (!payload.sub) throw Object.assign(new Error("Apple token has no subject"), { statusCode: 401 });
  return String(payload.sub);
}

// --- Apple JWS verification (lazy-loaded to avoid crash when certs not configured) ---
let appleLib;
function getAppleLib() {
  if (!appleLib) appleLib = import("@apple/app-store-server-library");
  return appleLib;
}

const bundleId = process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
const appAppleId = Number(process.env.APPLE_APP_ID || "6804499285");
const mode = String(process.env.APPLE_ENVIRONMENT || "PRODUCTION").toUpperCase();

let verifier;
async function appleVerifier() {
  if (verifier) return verifier;
  const { Environment, SignedDataVerifier } = await getAppleLib();
  const environment = mode === "SANDBOX" ? Environment.SANDBOX : Environment.PRODUCTION;
  // Support both: APPLE_ROOT_CA_B64 (base64 PEM bundle for serverless) or APPLE_ROOT_CA_PATHS (file paths for local)
  let certs;
  const b64 = process.env.APPLE_ROOT_CA_B64;
  if (b64) {
    // Base64-encoded PEM bundle — decode and split into individual certs
    const pem = Buffer.from(b64, "base64").toString("utf-8");
    certs = pem.split(/(?=-----BEGIN CERTIFICATE-----)/).filter(s => s.trim()).map(s => Buffer.from(s));
  } else {
    const { readFileSync } = await import("node:fs");
    const paths = String(process.env.APPLE_ROOT_CA_PATHS || "").split(",").map(s => s.trim()).filter(Boolean);
    if (!paths.length) throw new Error("APPLE_ROOT_CA_B64 or APPLE_ROOT_CA_PATHS is required for Apple verification");
    certs = paths.map(p => readFileSync(p));
  }
  verifier = new SignedDataVerifier(certs, process.env.APPLE_ONLINE_CHECKS !== "false", environment, bundleId, environment === Environment.PRODUCTION ? appAppleId : undefined);
  return verifier;
}

async function verifyTransaction(signedTransaction) {
  const v = await appleVerifier();
  const tx = await v.verifyAndDecodeTransaction(signedTransaction);
  tx.__signed = signedTransaction;
  return tx;
}

async function verifyNotification(signedPayload) {
  const v = await appleVerifier();
  return v.verifyAndDecodeNotification(signedPayload);
}

async function transactionFromNotification(notification) {
  const signed = notification?.data?.signedTransactionInfo;
  if (!signed) return null;
  return verifyTransaction(signed);
}

// --- DB helpers ---
async function ensureUser(subject) {
  await getPool().query(`INSERT INTO polyglot_users(subject) VALUES($1) ON CONFLICT(subject) DO UPDATE SET updated_at = now()`, [subject]);
}

async function startTrial(subject, trialDays = 3) {
  await ensureUser(subject);
  const { rows } = await getPool().query(
    `UPDATE polyglot_users SET trial_started_at = COALESCE(trial_started_at, now()), trial_ends_at = COALESCE(trial_ends_at, now() + ($2::text || ' days')::interval), updated_at = now() WHERE subject = $1 RETURNING trial_started_at, trial_ends_at`,
    [subject, String(trialDays)]
  );
  return rows[0];
}

async function upsertTransaction(tx, userSubject = null) {
  if (userSubject) await ensureUser(userSubject);
  const values = [
    String(tx.originalTransactionId), String(tx.transactionId), userSubject,
    tx.appAccountToken || null, tx.productId, tx.environment || "Production",
    tx.purchaseDate ? new Date(Number(tx.purchaseDate)) : null,
    tx.expiresDate ? new Date(Number(tx.expiresDate)) : null,
    tx.revocationDate ? new Date(Number(tx.revocationDate)) : null,
    tx.inAppOwnershipType || null, tx.__signed,
  ];
  await getPool().query(
    `INSERT INTO apple_transactions(original_transaction_id, transaction_id, user_subject, app_account_token, product_id, environment, purchase_date, expires_at, revocation_date, ownership_type, raw_signed_transaction)
     VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
     ON CONFLICT(original_transaction_id) DO UPDATE SET
       transaction_id = EXCLUDED.transaction_id,
       user_subject = COALESCE(EXCLUDED.user_subject, apple_transactions.user_subject),
       app_account_token = COALESCE(EXCLUDED.app_account_token, apple_transactions.app_account_token),
       product_id = EXCLUDED.product_id, environment = EXCLUDED.environment,
       purchase_date = EXCLUDED.purchase_date, expires_at = EXCLUDED.expires_at,
       revocation_date = EXCLUDED.revocation_date, ownership_type = EXCLUDED.ownership_type,
       raw_signed_transaction = EXCLUDED.raw_signed_transaction, updated_at = now()`,
    values
  );
}

async function linkTransactionToSubject(originalTransactionId, subject) {
  await ensureUser(subject);
  await getPool().query(`UPDATE apple_transactions SET user_subject=$2, updated_at=now() WHERE original_transaction_id=$1`, [String(originalTransactionId), subject]);
}

async function subjectForTransaction(tx) {
  if (tx.appAccountToken) {
    const { rows } = await getPool().query(`SELECT user_subject FROM apple_transactions WHERE app_account_token=$1 AND user_subject IS NOT NULL ORDER BY updated_at DESC LIMIT 1`, [tx.appAccountToken]);
    if (rows[0]?.user_subject) return rows[0].user_subject;
  }
  const { rows } = await getPool().query(`SELECT user_subject FROM apple_transactions WHERE original_transaction_id=$1`, [String(tx.originalTransactionId)]);
  return rows[0]?.user_subject || null;
}

async function entitlementForSubject(subject) {
  await ensureUser(subject);
  const userQ = await getPool().query(`SELECT trial_started_at, trial_ends_at FROM polyglot_users WHERE subject=$1`, [subject]);
  const txQ = await getPool().query(
    `SELECT product_id, expires_at, revocation_date FROM apple_transactions WHERE user_subject=$1 AND revocation_date IS NULL AND (expires_at IS NULL OR expires_at > now()) ORDER BY expires_at DESC NULLS FIRST LIMIT 1`, [subject]);
  return { user: userQ.rows[0], transaction: txQ.rows[0] || null };
}

function stateFrom({ user, transaction }) {
  if (transaction) {
    if (MONTHLY_IDS.has(transaction.product_id)) return "pro_monthly";
    if (ANNUAL_IDS.has(transaction.product_id)) return "pro_annual";
  }
  if (user?.trial_ends_at) return new Date(user.trial_ends_at).getTime() > Date.now() ? "trial" : "expired";
  return "not_started";
}

async function entitlementJson(subject) {
  const row = await entitlementForSubject(subject);
  return {
    state: stateFrom(row), userId: subject,
    trialStartedAt: row.user?.trial_started_at?.toISOString?.() || row.user?.trial_started_at || null,
    trialEndsAt: row.user?.trial_ends_at?.toISOString?.() || row.user?.trial_ends_at || null,
    source: row.transaction ? "apple_server_verified" : "account",
  };
}

// --- Hono app ---
const app = new Hono();

app.get("/", (c) => c.json({ ok: true, service: "polyglot-entitlements" }));
app.get("/health", (c) => c.json({ ok: true, service: "polyglot-entitlements" }));

app.get("/v1/entitlements/me", async (c) => {
  try {
    const subject = await verifyMcpUser(c);
    if (!subject) return c.json({ state: "not_started", userId: null, trialStartedAt: null, trialEndsAt: null, source: "anonymous" });
    return c.json(await entitlementJson(subject));
  } catch (e) {
    return c.json({ error: e.statusCode === 401 ? "unauthorized" : "request_failed" }, e.statusCode || 500);
  }
});

app.post("/v1/trials/start", async (c) => {
  try {
    const subject = await verifyMcpUser(c);
    if (!subject) return c.json({ error: "authentication_required", message: "Sign in to start a trial" }, 401);
    await startTrial(subject, TRIAL_DAYS);
    return c.json(await entitlementJson(subject));
  } catch (e) {
    return c.json({ error: e.statusCode === 401 ? "unauthorized" : "request_failed" }, e.statusCode || 500);
  }
});

app.post("/v1/apple/sync", async (c) => {
  try {
    const payload = await c.req.json();
    const subject = await verifyAppleIdentityToken(payload.identityToken);
    const tx = await verifyTransaction(payload.signedTransaction);
    if (!MONTHLY_IDS.has(tx.productId) && !ANNUAL_IDS.has(tx.productId)) {
      return c.json({ error: "unsupported_product" }, 400);
    }
    await upsertTransaction(tx, subject);
    await linkTransactionToSubject(tx.originalTransactionId, subject);
    return c.json({ ok: true, entitlement: await entitlementJson(subject) });
  } catch (e) {
    return c.json({ error: e.statusCode === 401 ? "unauthorized" : "request_failed" }, e.statusCode || 500);
  }
});

app.post("/v1/apple/notifications", async (c) => {
  try {
    const payload = await c.req.json();
    const notification = await verifyNotification(payload.signedPayload);
    const tx = await transactionFromNotification(notification);
    if (tx && (MONTHLY_IDS.has(tx.productId) || ANNUAL_IDS.has(tx.productId))) {
      const subject = await subjectForTransaction(tx);
      await upsertTransaction(tx, subject);
    }
    return c.json({ ok: true });
  } catch (e) {
    console.error(e);
    return c.json({ error: "request_failed" }, 500);
  }
});

export default app;
