/**
 * POLY-GLOT OAUTH 2.1 AUTHORIZATION SERVER
 *
 * Implements OAuth 2.1 authorization code + PKCE S256 flow for MCP clients
 * (ChatGPT, Claude, Cursor, etc.). Identity is established through Sign in
 * with Apple (web or native token). The same verified Apple subject that
 * native apps use is bound to MCP access tokens.
 *
 * Signing keys are persisted in Neon Postgres so tokens survive cold starts.
 *
 * SECURITY:
 * - PKCE S256 is mandatory (no plain)
 * - Access tokens are ES256 JWTs, audience = MCP resource
 * - Refresh tokens are opaque, rotated on use
 * - Apple identity tokens verified server-side
 * - Never log tokens, codes, Apple subjects, or secrets
 */
import { SignJWT, exportJWK, generateKeyPair, importJWK, jwtVerify, createRemoteJWKSet } from "jose";
import { createHash, randomUUID, randomBytes } from "node:crypto";
// Pool is optional — DB persistence only works when DATABASE_URL is set.
// In tests or local dev without a database, ephemeral in-memory keys are used.
let pool;
try { pool = (await import("./db.js")).pool; } catch { pool = null; }
import {
  validateClient,
  generateCode,
  storeCode,
  consumeCode,
  generateRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
  revokeRefreshToken,
} from "./oauth-store.js";

// ── Configuration ────────────────────────────────────────────────────
const ENTITLEMENTS_BASE = (process.env.POLYGLOT_ENTITLEMENTS_PUBLIC_URL ||
  "https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "");
const MCP_RESOURCE = (process.env.POLYGLOT_MCP_RESOURCE_URL ||
  "https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "");

const ACCESS_TOKEN_TTL = 3600;      // 1 hour
const APPLE_BUNDLE_ID = process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
const APPLE_SERVICE_ID = process.env.APPLE_SERVICE_ID || "";
const APPLE_TEAM_ID = process.env.APPLE_TEAM_ID || "";

// ── DB-Persisted Signing Key ─────────────────────────────────────────
let _signingKey = null;
let _signingKeyPublicJwk = null;
let _signingKeyId = null;

async function getSigningKey() {
  if (_signingKey) return { privateKey: _signingKey, kid: _signingKeyId };

  // 1. Try env var override first
  const envKey = (process.env.POLYGLOT_OAUTH_SIGNING_KEY || "").trim();
  if (envKey) {
    try {
      const jwk = JSON.parse(envKey);
      _signingKeyId = jwk.kid || "polyglot-oauth-1";
      _signingKey = await importJWK(jwk, "ES256");
      const pub = { ...jwk }; delete pub.d;
      _signingKeyPublicJwk = { ...pub, kid: _signingKeyId, use: "sig", alg: "ES256" };
      return { privateKey: _signingKey, kid: _signingKeyId };
    } catch { /* fall through to DB */ }
  }

  // 2. Try DB-persisted key
  try {
    const { rows } = await pool.query(
      "SELECT kid, jwk_private, jwk_public FROM oauth_signing_keys WHERE active = true ORDER BY created_at DESC LIMIT 1"
    );
    if (rows.length) {
      const row = rows[0];
      _signingKeyId = row.kid;
      _signingKey = await importJWK(row.jwk_private, "ES256");
      _signingKeyPublicJwk = { ...row.jwk_public, kid: row.kid, use: "sig", alg: "ES256" };
      return { privateKey: _signingKey, kid: _signingKeyId };
    }
  } catch { /* DB not ready, generate new */ }

  // 3. Generate new key and persist to DB
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = `polyglot-oauth-${randomBytes(4).toString("hex")}`;
  const privJwk = await exportJWK(privateKey);
  const pubJwk = await exportJWK(publicKey);
  _signingKeyId = kid;
  _signingKey = privateKey;
  _signingKeyPublicJwk = { ...pubJwk, kid, use: "sig", alg: "ES256" };

  try {
    await pool.query(
      "INSERT INTO oauth_signing_keys (kid, jwk_private, jwk_public, algorithm) VALUES ($1, $2, $3, 'ES256') ON CONFLICT (kid) DO NOTHING",
      [kid, privJwk, pubJwk]
    );
  } catch { /* best-effort persist */ }

  return { privateKey: _signingKey, kid: _signingKeyId };
}

// ── Token Generation ─────────────────────────────────────────────────
async function issueAccessToken(subject, scope, resource) {
  const { privateKey, kid } = await getSigningKey();
  return new SignJWT({
    sub: subject,
    scope: scope || "mcp:read mcp:write",
    resource: resource || MCP_RESOURCE,
  })
    .setProtectedHeader({ alg: "ES256", kid, typ: "at+jwt" })
    .setIssuer(ENTITLEMENTS_BASE)
    .setAudience(MCP_RESOURCE)
    .setExpirationTime(`${ACCESS_TOKEN_TTL}s`)
    .setIssuedAt()
    .setJti(randomUUID())
    .sign(privateKey);
}

// ── Apple Identity Verification ──────────────────────────────────────
let appleJwks;
async function verifyAppleIdToken(idToken) {
  if (!idToken) throw oauthError("invalid_grant", "Apple identity token required");
  appleJwks ||= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  const audiences = [APPLE_BUNDLE_ID, APPLE_SERVICE_ID].filter(Boolean);
  if (!audiences.length) throw oauthError("server_error", "Apple audience not configured");
  try {
    const { payload } = await jwtVerify(idToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience: audiences,
    });
    if (!payload.sub) throw new Error("No subject");
    return String(payload.sub);
  } catch {
    throw oauthError("invalid_grant", "Invalid Apple identity token");
  }
}

// ── OAuth Endpoint Handlers ──────────────────────────────────────────

/** GET /.well-known/oauth-authorization-server */
export function authorizationServerMetadata() {
  return {
    issuer: ENTITLEMENTS_BASE,
    authorization_endpoint: `${ENTITLEMENTS_BASE}/oauth/authorize`,
    token_endpoint: `${ENTITLEMENTS_BASE}/oauth/token`,
    registration_endpoint: `${ENTITLEMENTS_BASE}/oauth/register`,
    revocation_endpoint: `${ENTITLEMENTS_BASE}/oauth/revoke`,
    jwks_uri: `${ENTITLEMENTS_BASE}/oauth/jwks`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["mcp:read", "mcp:write", "offline_access"],
    service_documentation: "https://poly-glot.ai",
    resource: MCP_RESOURCE,
  };
}

/** GET /oauth/jwks */
export async function jwksEndpoint() {
  await getSigningKey();
  return { keys: _signingKeyPublicJwk ? [_signingKeyPublicJwk] : [] };
}

/** GET /oauth/authorize — HTML authorization page */
export function authorizePageHtml(params) {
  const { client_id, redirect_uri, response_type, code_challenge,
          code_challenge_method, state, scope, resource } = params;
  if (response_type !== "code") return errorPageHtml("Unsupported response_type. Only 'code' is supported.");
  if (!client_id) return errorPageHtml("client_id is required.");
  if (!redirect_uri) return errorPageHtml("redirect_uri is required.");
  if (!code_challenge) return errorPageHtml("code_challenge is required (PKCE S256).");
  if (code_challenge_method && code_challenge_method !== "S256") return errorPageHtml("Only S256 code_challenge_method is supported.");
  if (!state) return errorPageHtml("state parameter is required.");
  try { validateClient(client_id, redirect_uri); } catch (e) { return errorPageHtml(e.error_description || "Invalid client."); }

  const appleWebConfigured = Boolean(APPLE_SERVICE_ID && APPLE_TEAM_ID);
  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Poly-Glot AI — Sign In</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:linear-gradient(135deg,#1a1a2e,#16213e 50%,#0f3460);min-height:100vh;display:flex;align-items:center;justify-content:center;color:#fff}
.c{background:rgba(255,255,255,.08);backdrop-filter:blur(20px);border:1px solid rgba(255,255,255,.15);border-radius:24px;padding:48px 40px;max-width:440px;width:90%;text-align:center}
.logo{font-size:48px;margin-bottom:8px}h1{font-size:22px;font-weight:600;margin-bottom:8px}
.sub{color:rgba(255,255,255,.7);font-size:14px;margin-bottom:32px;line-height:1.5}.cn{color:#64b5f6;font-weight:500}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;background:#fff;color:#000;border:none;border-radius:12px;padding:14px 28px;font-size:16px;font-weight:500;cursor:pointer;transition:transform .15s,box-shadow .15s;width:100%}
.btn:hover{transform:translateY(-1px);box-shadow:0 8px 25px rgba(0,0,0,.3)}
.btn svg{width:20px;height:20px}
.info{margin-top:24px;font-size:12px;color:rgba(255,255,255,.5);line-height:1.6}.info a{color:rgba(255,255,255,.7)}
hr{border:none;border-top:1px solid rgba(255,255,255,.1);margin:24px 0}
.sc{text-align:left;margin:16px 0;padding:16px;background:rgba(0,0,0,.2);border-radius:12px;font-size:13px}
.sc h3{font-size:13px;color:rgba(255,255,255,.7);margin-bottom:8px}.sc li{list-style:none;padding:4px 0}.sc li::before{content:"✓ ";color:#4caf50}
input[type=text]{width:100%;padding:12px 16px;border-radius:10px;border:1px solid rgba(255,255,255,.2);background:rgba(0,0,0,.3);color:#fff;font-size:14px;margin-bottom:16px;font-family:monospace}
</style></head><body><div class="c">
<div class="logo">🔥</div><h1>Poly-Glot AI Workspace</h1>
<p class="sub"><span class="cn">${esc(client_id)}</span> wants to connect to your Poly-Glot account.</p>
<div class="sc"><h3>This app will be able to:</h3><ul><li>View your subscription status</li><li>Use Poly-Glot prompt tools on your behalf</li><li>Access workspace features based on your plan</li></ul></div><hr>
${appleWebConfigured ? `
<form method="POST" action="${ENTITLEMENTS_BASE}/oauth/authorize">
<input type="hidden" name="client_id" value="${esc(client_id)}"><input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}">
<input type="hidden" name="code_challenge" value="${esc(code_challenge)}"><input type="hidden" name="code_challenge_method" value="S256">
<input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="scope" value="${esc(scope||"")}">
<input type="hidden" name="resource" value="${esc(resource||"")}"><input type="hidden" name="action" value="apple_signin">
<button type="submit" class="btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg> Sign in with Apple</button></form>` : `
<form method="POST" action="${ENTITLEMENTS_BASE}/oauth/authorize">
<input type="hidden" name="client_id" value="${esc(client_id)}"><input type="hidden" name="redirect_uri" value="${esc(redirect_uri)}">
<input type="hidden" name="code_challenge" value="${esc(code_challenge)}"><input type="hidden" name="code_challenge_method" value="S256">
<input type="hidden" name="state" value="${esc(state)}"><input type="hidden" name="scope" value="${esc(scope||"")}">
<input type="hidden" name="resource" value="${esc(resource||"")}"><input type="hidden" name="action" value="apple_token">
<p class="sub" style="margin-bottom:12px">Sign in with your Apple ID to connect your Poly-Glot subscription.</p>
<p class="sub" style="font-size:12px;margin-bottom:16px">Open the Poly-Glot app on your device, go to Settings → Account, and copy your authentication token.</p>
<input type="text" name="identity_token" placeholder="Paste Apple identity token from app">
<button type="submit" class="btn"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/></svg> Verify &amp; Connect</button></form>`}
<div class="info"><p>Your Apple ID identity is verified server-side. We never store your Apple password.</p>
<p style="margin-top:8px"><a href="https://poly-glot.ai/privacy">Privacy</a> · <a href="https://poly-glot.ai/terms">Terms</a></p></div>
</div></body></html>`;
}

/** POST /oauth/authorize */
export async function handleAuthorize(body) {
  const { client_id, redirect_uri, code_challenge, code_challenge_method,
          state, scope, resource, action, identity_token } = body;
  if (!client_id || !redirect_uri || !code_challenge || !state)
    throw oauthError("invalid_request", "Missing required parameters");
  if (code_challenge_method && code_challenge_method !== "S256")
    throw oauthError("invalid_request", "Only S256 PKCE is supported");
  validateClient(client_id, redirect_uri);

  let subject;
  if (action === "apple_signin" && APPLE_SERVICE_ID) {
    const appleAuthUrl = new URL("https://appleid.apple.com/auth/authorize");
    appleAuthUrl.searchParams.set("client_id", APPLE_SERVICE_ID);
    appleAuthUrl.searchParams.set("redirect_uri", `${ENTITLEMENTS_BASE}/oauth/apple-callback`);
    appleAuthUrl.searchParams.set("response_type", "code id_token");
    appleAuthUrl.searchParams.set("scope", "name email");
    appleAuthUrl.searchParams.set("response_mode", "form_post");
    appleAuthUrl.searchParams.set("state", Buffer.from(JSON.stringify({
      client_id, redirect_uri, code_challenge, code_challenge_method: "S256", state, scope, resource,
    })).toString("base64url"));
    return { redirect: appleAuthUrl.toString() };
  }
  if (action === "apple_token" && identity_token) {
    subject = await verifyAppleIdToken(identity_token);
  } else {
    throw oauthError("invalid_request", "No valid authentication method provided");
  }

  const code = generateCode();
  storeCode(code, { subject, clientId: client_id, redirectUri: redirect_uri,
    codeChallenge: code_challenge, codeChallengeMethod: "S256",
    resource: resource || MCP_RESOURCE, scope: scope || "mcp:read mcp:write" });
  const redirectUrl = new URL(redirect_uri);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", state);
  return { redirect: redirectUrl.toString() };
}

/** POST /oauth/apple-callback */
export async function handleAppleCallback(body) {
  const { id_token, state: encodedState, error: appleError } = body;
  if (appleError) throw oauthError("access_denied", `Apple sign-in error: ${appleError}`);
  if (!id_token || !encodedState) throw oauthError("invalid_request", "Missing Apple callback data");
  const subject = await verifyAppleIdToken(id_token);
  let orig;
  try { orig = JSON.parse(Buffer.from(encodedState, "base64url").toString("utf8")); }
  catch { throw oauthError("invalid_request", "Invalid state"); }
  const code = generateCode();
  storeCode(code, { subject, clientId: orig.client_id, redirectUri: orig.redirect_uri,
    codeChallenge: orig.code_challenge, codeChallengeMethod: orig.code_challenge_method || "S256",
    resource: orig.resource || MCP_RESOURCE, scope: orig.scope || "mcp:read mcp:write" });
  const redirectUrl = new URL(orig.redirect_uri);
  redirectUrl.searchParams.set("code", code);
  redirectUrl.searchParams.set("state", orig.state);
  return { redirect: redirectUrl.toString() };
}

/** POST /oauth/token */
export async function handleToken(body) {
  const { grant_type, code, redirect_uri, client_id, code_verifier, refresh_token, scope, resource } = body;
  if (!client_id) throw oauthError("invalid_request", "client_id is required");

  if (grant_type === "authorization_code") {
    if (!code) throw oauthError("invalid_request", "code is required");
    if (!code_verifier) throw oauthError("invalid_request", "code_verifier is required (PKCE)");
    const grant = consumeCode(code, { clientId: client_id, redirectUri: redirect_uri, codeVerifier: code_verifier });
    const accessToken = await issueAccessToken(grant.subject, grant.scope, grant.resource);
    const refreshTok = generateRefreshToken();
    storeRefreshToken(refreshTok, { subject: grant.subject, clientId: client_id, scope: grant.scope, resource: grant.resource });
    return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL, refresh_token: refreshTok, scope: grant.scope };
  }
  if (grant_type === "refresh_token") {
    if (!refresh_token) throw oauthError("invalid_request", "refresh_token is required");
    const grant = consumeRefreshToken(refresh_token, { clientId: client_id });
    const accessToken = await issueAccessToken(grant.subject, scope || grant.scope, resource || grant.resource);
    const newRefresh = generateRefreshToken();
    storeRefreshToken(newRefresh, { subject: grant.subject, clientId: client_id, scope: scope || grant.scope, resource: resource || grant.resource });
    return { access_token: accessToken, token_type: "Bearer", expires_in: ACCESS_TOKEN_TTL, refresh_token: newRefresh, scope: scope || grant.scope };
  }
  throw oauthError("unsupported_grant_type", `Unsupported grant_type: ${grant_type}`);
}

/** POST /oauth/revoke */
export function handleRevoke(body) {
  if (body?.token) revokeRefreshToken(body.token);
  return {};
}

/** POST /oauth/register — Dynamic Client Registration */
const dynamicClients = new Map();
export function handleRegister(body) {
  const { redirect_uris, client_name, token_endpoint_auth_method, grant_types, response_types, scope } = body;
  if (!redirect_uris || !Array.isArray(redirect_uris) || !redirect_uris.length)
    throw oauthError("invalid_client_metadata", "redirect_uris is required");
  for (const uri of redirect_uris) {
    try { const u = new URL(uri); if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") throw oauthError("invalid_redirect_uri", "redirect_uri must be HTTPS or localhost"); }
    catch (e) { if (e.error) throw e; throw oauthError("invalid_redirect_uri", `Invalid redirect_uri: ${uri}`); }
  }
  const clientId = `polyglot-${randomBytes(16).toString("hex")}`;
  dynamicClients.set(clientId, { redirectUris: redirect_uris, name: client_name || "Dynamic Client" });
  return { client_id: clientId, client_name: client_name || "Dynamic Client", redirect_uris,
    grant_types: grant_types || ["authorization_code", "refresh_token"],
    response_types: response_types || ["code"],
    token_endpoint_auth_method: token_endpoint_auth_method || "none",
    registration_client_uri: `${ENTITLEMENTS_BASE}/oauth/register/${clientId}` };
}

/** Protected Resource Metadata (for MCP function) */
export function protectedResourceMetadata() {
  return {
    resource: MCP_RESOURCE,
    authorization_servers: [ENTITLEMENTS_BASE],
    scopes_supported: ["mcp:read", "mcp:write", "offline_access"],
    bearer_methods_supported: ["header"],
    resource_documentation: "https://poly-glot.ai",
  };
}

// ── Helpers ──────────────────────────────────────────────────────────
function esc(s) { return String(s||"").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;"); }
function errorPageHtml(msg) {
  return `<!DOCTYPE html><html><head><title>Error</title><style>body{font-family:system-ui;background:#1a1a2e;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh}.b{background:rgba(255,0,0,.1);border:1px solid rgba(255,0,0,.3);border-radius:16px;padding:32px;max-width:400px;text-align:center}h1{font-size:18px;margin-bottom:12px}p{color:rgba(255,255,255,.7);font-size:14px}</style></head><body><div class="b"><h1>⚠️ Authorization Error</h1><p>${esc(msg)}</p></div></body></html>`;
}
function oauthError(error, description) {
  const e = new Error(description); e.error = error; e.error_description = description;
  e.statusCode = error === "invalid_client" ? 401 : 400; return e;
}
