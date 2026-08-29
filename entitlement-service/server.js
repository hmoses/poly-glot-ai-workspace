/**
 * POLY-GLOT ENTITLEMENT API ROUTES
 *
 * the production runtime expose a single public application port. This module is
 * therefore a route handler imported by ../server.js rather than a second
 * production listener. Running this file directly still starts a local-only
 * standalone listener for focused entitlement debugging.
 *
 * SECURITY BOUNDARY: no client-provided plan or isPro value is trusted. User
 * identity is verified from a bearer JWT, and StoreKit state is accepted only
 * after Apple JWS verification.
 */
import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import { verifyAppleIdentityToken, verifyMcpUser } from "./auth.js";
import { transactionFromNotification, verifyNotification, verifyTransaction } from "./apple.js";
import { entitlementForSubject, linkTransactionToSubject, startTrial, subjectForTransaction, upsertTransaction } from "./db.js";

const MONTHLY_IDS = new Set((process.env.POLYGLOT_MONTHLY_PRODUCT_IDS || "ai.polyglot.promptstudio.mac.subscription.monthly,ai.polyglot.workspace.pro.monthly").split(",").map(s => s.trim()).filter(Boolean));
const ANNUAL_IDS = new Set((process.env.POLYGLOT_ANNUAL_PRODUCT_IDS || "ai.polyglot.mac.pro.annual.2704,ai.polyglot.workspace.pro.annual").split(",").map(s => s.trim()).filter(Boolean));
const TRIAL_DAYS = 3;

async function body(req) {
  const parts = [];
  for await (const chunk of req) parts.push(chunk);
  if (!parts.length) return {};
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}

function json(res, status, value) {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  });
  res.end(JSON.stringify(value));
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
    state: stateFrom(row),
    userId: subject,
    trialStartedAt: row.user?.trial_started_at?.toISOString?.() || row.user?.trial_started_at || null,
    trialEndsAt: row.user?.trial_ends_at?.toISOString?.() || row.user?.trial_ends_at || null,
    source: row.transaction ? "apple_server_verified" : "account",
  };
}

export async function handleEntitlementRequest(req, res) {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") return json(res, 204, {});
    if (req.method === "GET" && url.pathname === "/healthz") {
      return json(res, 200, { ok: true, service: "polyglot-workspace", database: "neon" });
    }

    if (req.method === "GET" && url.pathname === "/v1/entitlements/me") {
      const subject = await verifyMcpUser(req);
      return json(res, 200, await entitlementJson(subject));
    }

    if (req.method === "POST" && url.pathname === "/v1/trials/start") {
      const subject = await verifyMcpUser(req);
      await startTrial(subject, TRIAL_DAYS);
      return json(res, 200, await entitlementJson(subject));
    }

    if (req.method === "POST" && url.pathname === "/v1/apple/sync") {
      const payload = await body(req);
      const subject = await verifyAppleIdentityToken(payload.identityToken);
      const tx = await verifyTransaction(payload.signedTransaction);
      if (!MONTHLY_IDS.has(tx.productId) && !ANNUAL_IDS.has(tx.productId)) {
        return json(res, 400, { error: "unsupported_product" });
      }
      await upsertTransaction(tx, subject);
      await linkTransactionToSubject(tx.originalTransactionId, subject);
      return json(res, 200, { ok: true, entitlement: await entitlementJson(subject) });
    }

    if (req.method === "POST" && url.pathname === "/v1/apple/notifications") {
      const payload = await body(req);
      const notification = await verifyNotification(payload.signedPayload);
      const tx = await transactionFromNotification(notification);
      if (tx && (MONTHLY_IDS.has(tx.productId) || ANNUAL_IDS.has(tx.productId))) {
        const subject = await subjectForTransaction(tx);
        await upsertTransaction(tx, subject);
      }
      return json(res, 200, { ok: true });
    }

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    console.error("Entitlement request failed", error);
    return json(res, error.statusCode || 500, {
      error: error.statusCode === 401 ? "unauthorized" : "request_failed",
    });
  }
}

// Local development only. Production imports handleEntitlementRequest into the
// single production host listener in ../server.js.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const port = Number(process.env.ENTITLEMENT_PORT || 8790);
  createServer(handleEntitlementRequest).listen(port, "0.0.0.0", () => {
    console.log(`Poly-Glot entitlement debug service listening on :${port}`);
  });
}
