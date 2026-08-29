/**
 * POLY-GLOT ENTITLEMENT API
 * GOOSE NOTE: Deploy this routing logic as Neon Function HTTP routes.
 * It verifies identity and Apple-signed transactions before granting Pro.
 * Do not accept a client-provided boolean or plan name as proof of purchase.
 */
import { createServer } from "node:http";
import { verifyAppleIdentityToken, verifyMcpUser } from "./auth.js";
import { transactionFromNotification, verifyNotification, verifyTransaction } from "./apple.js";
import { entitlementForSubject, linkTransactionToSubject, startTrial, subjectForTransaction, upsertTransaction } from "./db.js";

const MONTHLY_IDS = new Set((process.env.POLYGLOT_MONTHLY_PRODUCT_IDS || "ai.polyglot.promptstudio.mac.subscription.monthly,ai.polyglot.workspace.pro.monthly").split(",").map(s => s.trim()).filter(Boolean));
const ANNUAL_IDS = new Set((process.env.POLYGLOT_ANNUAL_PRODUCT_IDS || "ai.polyglot.mac.pro.annual.2704,ai.polyglot.workspace.pro.annual").split(",").map(s => s.trim()).filter(Boolean));
const TRIAL_DAYS = 3;

async function body(req) {
  const parts=[]; for await (const chunk of req) parts.push(chunk);
  if (!parts.length) return {};
  return JSON.parse(Buffer.concat(parts).toString("utf8"));
}
function json(res, status, value) { res.writeHead(status, {"content-type":"application/json; charset=utf-8", "cache-control":"no-store"}); res.end(JSON.stringify(value)); }
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

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (req.method === "GET" && url.pathname === "/healthz") return json(res, 200, { ok:true, service:"polyglot-entitlements" });

    // GOOSE NOTE: ChatGPT calls this after authenticating; never allow userId in query/body to override verified subject.
    if (req.method === "GET" && url.pathname === "/v1/entitlements/me") {
      const subject = await verifyMcpUser(req);
      return json(res, 200, await entitlementJson(subject));
    }

    if (req.method === "POST" && url.pathname === "/v1/trials/start") {
      const subject = await verifyMcpUser(req);
      await startTrial(subject, TRIAL_DAYS);
      return json(res, 200, await entitlementJson(subject));
    }

    // Called by the native Mac app. Both the Apple identity token and StoreKit JWS are verified server-side.
    // GOOSE NOTE: Mac subscriber linking requires BOTH verified Apple identity and verified StoreKit JWS.
    if (req.method === "POST" && url.pathname === "/v1/apple/sync") {
      const payload = await body(req);
      const subject = await verifyAppleIdentityToken(payload.identityToken);
      const tx = await verifyTransaction(payload.signedTransaction);
      if (!MONTHLY_IDS.has(tx.productId) && !ANNUAL_IDS.has(tx.productId)) return json(res, 400, { error:"unsupported_product" });
      await upsertTransaction(tx, subject);
      await linkTransactionToSubject(tx.originalTransactionId, subject);
      return json(res, 200, { ok:true, entitlement: await entitlementJson(subject) });
    }

    // Configure this HTTPS URL in App Store Connect as App Store Server Notifications V2.
    // GOOSE NOTE: This endpoint receives App Store Server Notifications V2; signedPayload must be verified before use.
    if (req.method === "POST" && url.pathname === "/v1/apple/notifications") {
      const payload = await body(req);
      const notification = await verifyNotification(payload.signedPayload);
      const tx = await transactionFromNotification(notification);
      if (tx && (MONTHLY_IDS.has(tx.productId) || ANNUAL_IDS.has(tx.productId))) {
        const subject = await subjectForTransaction(tx);
        await upsertTransaction(tx, subject);
      }
      return json(res, 200, { ok:true });
    }

    return json(res, 404, { error:"not_found" });
  } catch (error) {
    console.error(error);
    return json(res, error.statusCode || 500, { error: error.statusCode === 401 ? "unauthorized" : "request_failed" });
  }
});

const port = Number(process.env.ENTITLEMENT_PORT || 8790);
server.listen(port, () => console.log(`Poly-Glot entitlement service listening on :${port}`));
