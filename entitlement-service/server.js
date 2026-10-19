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
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { verifyAppleIdentityToken, verifyMcpUser } from "./auth.js";
import { transactionFromNotification, verifyNotification, verifyTransaction } from "./apple.js";
import { entitlementForSubject, linkTransactionToSubject, subjectForTransaction, upsertTransaction } from "./db.js";
import {
  authorizationServerMetadata,
  jwksEndpoint,
  authorizePageHtml,
  handleAuthorize,
  handleAppleCallback,
  handleToken,
  handleRevoke,
  handleRegister,
  protectedResourceMetadata,
} from "./oauth.js";

const MONTHLY_IDS = new Set((process.env.POLYGLOT_MONTHLY_PRODUCT_IDS || "ai.polyglot.promptstudio.mac.subscription.monthly,ai.polyglot.workspace.pro.monthly").split(",").map(s => s.trim()).filter(Boolean));
const ANNUAL_IDS = new Set((process.env.POLYGLOT_ANNUAL_PRODUCT_IDS || "ai.polyglot.mac.pro.annual.2704,ai.polyglot.workspace.pro.annual").split(",").map(s => s.trim()).filter(Boolean));
const TRIAL_DAYS = 3;

// Match IAPManagerMac.stableAccountToken() exactly. Reject valid Apple JWS
// receipts whose appAccountToken was bound to a different Apple sign-in user.
function verifyAppAccountToken(subject, transaction) {
  if (!transaction.appAccountToken) return; // Legacy transactions predate account tokens.
  const bytes = Buffer.from(createHash("sha256").update(subject).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  const expected = hex.slice(0, 8) + hex.slice(8, 12) + hex.slice(12, 16) + hex.slice(16, 20) + hex.slice(20);
  const received = String(transaction.appAccountToken).replace(/-/g, "").toLowerCase();
  if (received !== expected) {
    throw Object.assign(new Error("Apple transaction belongs to another sign-in account"), { statusCode: 403 });
  }
}

async function body(req) {
  const parts = [];
  for await (const chunk of req) parts.push(chunk);
  if (!parts.length) return {};
  const raw = Buffer.concat(parts).toString("utf8");
  const ct = String(typeof req.headers?.get === "function" ? req.headers.get("content-type") : req.headers?.["content-type"] || "");
  if (ct.includes("application/x-www-form-urlencoded")) {
    return Object.fromEntries(new URLSearchParams(raw));
  }
  return JSON.parse(raw);
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

export function stateFrom({ user, transaction }) {
  // A missing expiry or revoked receipt cannot grant an indefinite Pro plan.
  const expiresAt = Date.parse(transaction?.expires_at || "");
  const verifiedActive = transaction && !transaction.revocation_date &&
    Number.isFinite(expiresAt) && expiresAt > Date.now();
  if (verifiedActive) {
    if (MONTHLY_IDS.has(transaction.product_id)) return "pro_monthly";
    if (ANNUAL_IDS.has(transaction.product_id)) return "pro_annual";
  }
  // Honor only already-existing legacy app-managed trials before expiry.
  const trialEndsAt = Date.parse(user?.trial_ends_at || "");
  if (Number.isFinite(trialEndsAt))
    return trialEndsAt > Date.now() ? "trial" : "expired";
  return "not_started";
}

async function entitlementJson(subject) {
  const row = await entitlementForSubject(subject);
  return {
    state: stateFrom(row),
    userId: subject,
    trialStartedAt: row.user?.trial_started_at?.toISOString?.() || row.user?.trial_started_at || null,
    trialEndsAt: row.user?.trial_ends_at?.toISOString?.() || row.user?.trial_ends_at || null,
    lastFreeSendAt: row.user?.last_free_send_at?.toISOString?.() || row.user?.last_free_send_at || null,
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
      await verifyMcpUser(req);
      return json(res, 403, {error:"apple_subscription_required"});
    }

    if (req.method === "POST" && url.pathname === "/v1/free-send/consume") {
      await verifyMcpUser(req);
      return json(res, 403, {error:"subscription_required"});
    }

    if (req.method === "POST" && url.pathname === "/v1/apple/sync") {
      const payload = await body(req);
      const subject = await verifyAppleIdentityToken(payload.identityToken);
      const tx = await verifyTransaction(payload.signedTransaction);
      verifyAppAccountToken(subject, tx);
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

    // ── OAuth 2.1 Authorization Server routes ──────────────────────
    if (req.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
      return json(res, 200, authorizationServerMetadata());
    }
    if (req.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return json(res, 200, protectedResourceMetadata());
    }
    if (req.method === "GET" && url.pathname === "/oauth/jwks") {
      return json(res, 200, await jwksEndpoint());
    }
    if (req.method === "GET" && url.pathname === "/oauth/authorize") {
      const params = Object.fromEntries(url.searchParams.entries());
      const html = authorizePageHtml(params);
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(html);
    }
    if (req.method === "POST" && url.pathname === "/oauth/authorize") {
      const payload = await body(req);
      // Handle URL-encoded form data from browser
      const formData = typeof payload === "string"
        ? Object.fromEntries(new URLSearchParams(payload))
        : payload;
      const result = await handleAuthorize(formData);
      if (result.redirect) {
        res.writeHead(302, { location: result.redirect, "cache-control": "no-store" });
        return res.end();
      }
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/oauth/apple-callback") {
      const payload = await body(req);
      const formData = typeof payload === "string"
        ? Object.fromEntries(new URLSearchParams(payload))
        : payload;
      const result = await handleAppleCallback(formData);
      if (result.redirect) {
        res.writeHead(302, { location: result.redirect, "cache-control": "no-store" });
        return res.end();
      }
      return json(res, 200, result);
    }
    if (req.method === "POST" && url.pathname === "/oauth/token") {
      const payload = await body(req);
      return json(res, 200, await handleToken(payload));
    }
    if (req.method === "POST" && url.pathname === "/oauth/revoke") {
      const payload = await body(req);
      handleRevoke(payload);
      return json(res, 200, {});
    }
    if (req.method === "POST" && url.pathname === "/oauth/register") {
      const payload = await body(req);
      return json(res, 201, handleRegister(payload));
    }

    return json(res, 404, { error: "not_found" });
  } catch (error) {
    console.error("Entitlement request failed", error);
    if (error.statusCode === 401) {
      const resourceMetadata = `${(process.env.POLYGLOT_ENTITLEMENTS_PUBLIC_URL || "https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
      res.writeHead(401, {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
        "www-authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, content-type",
        "access-control-allow-methods": "GET, POST, OPTIONS",
      });
      return res.end(JSON.stringify({ error: "unauthorized" }));
    }
    if (error.error) {
      // OAuth-specific error (invalid_grant, invalid_client, etc.)
      return json(res, error.statusCode || 400, {
        error: error.error,
        error_description: error.error_description,
      });
    }
    return json(res, error.statusCode || 500, { error: "request_failed" });
  }
}

function webJson(status, value) {
  return Response.json(value, {
    status,
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    },
  });
}

export async function handleEntitlementRequestWeb(request) {
  try {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "authorization, content-type",
      "access-control-allow-methods": "GET, POST, OPTIONS",
    }});

    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/healthz")) {
      return webJson(200, { ok: true, service: "polyglot-entitlements", database: "neon" });
    }

    if (request.method === "GET" && url.pathname === "/v1/entitlements/me") {
      const subject = await verifyMcpUser(request);
      return webJson(200, await entitlementJson(subject));
    }

    if (request.method === "POST" && url.pathname === "/v1/trials/start") {
      await verifyMcpUser(request);
      return webJson(403, {error:"apple_subscription_required"});
    }

    if (request.method === "POST" && url.pathname === "/v1/free-send/consume") {
      await verifyMcpUser(request);
      return webJson(403, {error:"subscription_required"});
    }

    if (request.method === "POST" && url.pathname === "/v1/apple/sync") {
      const payload = await request.json();
      const subject = await verifyAppleIdentityToken(payload.identityToken);
      const tx = await verifyTransaction(payload.signedTransaction);
      verifyAppAccountToken(subject, tx);
      if (!MONTHLY_IDS.has(tx.productId) && !ANNUAL_IDS.has(tx.productId)) return webJson(400, { error: "unsupported_product" });
      await upsertTransaction(tx, subject);
      await linkTransactionToSubject(tx.originalTransactionId, subject);
      return webJson(200, { ok: true, entitlement: await entitlementJson(subject) });
    }

    if (request.method === "POST" && url.pathname === "/v1/apple/notifications") {
      const payload = await request.json();
      const notification = await verifyNotification(payload.signedPayload);
      const tx = await transactionFromNotification(notification);
      if (tx && (MONTHLY_IDS.has(tx.productId) || ANNUAL_IDS.has(tx.productId))) {
        const subject = await subjectForTransaction(tx);
        await upsertTransaction(tx, subject);
      }
      return webJson(200, { ok: true });
    }

    // ── OAuth 2.1 Authorization Server routes ──────────────────────
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-authorization-server") {
      return webJson(200, authorizationServerMetadata());
    }
    if (request.method === "GET" && url.pathname === "/.well-known/oauth-protected-resource") {
      return webJson(200, protectedResourceMetadata());
    }
    if (request.method === "GET" && url.pathname === "/oauth/jwks") {
      return webJson(200, await jwksEndpoint());
    }
    if (request.method === "GET" && url.pathname === "/oauth/authorize") {
      const params = Object.fromEntries(url.searchParams.entries());
      const html = authorizePageHtml(params);
      return new Response(html, {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
                    "access-control-allow-origin": "*" },
      });
    }
    if (request.method === "POST" && url.pathname === "/oauth/authorize") {
      const ct = request.headers.get("content-type") || "";
      let formData;
      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await request.text();
        formData = Object.fromEntries(new URLSearchParams(text));
      } else {
        formData = await request.json();
      }
      const result = await handleAuthorize(formData);
      if (result.redirect) {
        return new Response(null, { status: 302, headers: { location: result.redirect, "cache-control": "no-store" } });
      }
      return webJson(200, result);
    }
    if (request.method === "POST" && url.pathname === "/oauth/apple-callback") {
      const ct = request.headers.get("content-type") || "";
      let formData;
      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await request.text();
        formData = Object.fromEntries(new URLSearchParams(text));
      } else {
        formData = await request.json();
      }
      const result = await handleAppleCallback(formData);
      if (result.redirect) {
        return new Response(null, { status: 302, headers: { location: result.redirect, "cache-control": "no-store" } });
      }
      return webJson(200, result);
    }
    if (request.method === "POST" && url.pathname === "/oauth/token") {
      const ct = request.headers.get("content-type") || "";
      let payload;
      if (ct.includes("application/x-www-form-urlencoded")) {
        const text = await request.text();
        payload = Object.fromEntries(new URLSearchParams(text));
      } else {
        payload = await request.json();
      }
      return webJson(200, await handleToken(payload));
    }
    if (request.method === "POST" && url.pathname === "/oauth/revoke") {
      const payload = await request.json().catch(() => ({}));
      handleRevoke(payload);
      return webJson(200, {});
    }
    if (request.method === "POST" && url.pathname === "/oauth/register") {
      const payload = await request.json();
      return webJson(201, handleRegister(payload));
    }

    return webJson(404, { error: "not_found" });
  } catch (error) {
    console.error("Entitlement web request failed", error);
    if (error.statusCode === 401) {
      const resourceMetadata = `${(process.env.POLYGLOT_ENTITLEMENTS_PUBLIC_URL || "https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "")}/.well-known/oauth-protected-resource`;
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: {
          "content-type": "application/json; charset=utf-8",
          "cache-control": "no-store",
          "www-authenticate": `Bearer resource_metadata="${resourceMetadata}"`,
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "authorization, content-type",
          "access-control-allow-methods": "GET, POST, OPTIONS",
        },
      });
    }
    if (error.error) {
      return webJson(error.statusCode || 400, {
        error: error.error,
        error_description: error.error_description,
      });
    }
    return webJson(error.statusCode || 500, { error: "request_failed" });
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
