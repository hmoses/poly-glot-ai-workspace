/**
 * POLY-GLOT OAUTH STORE
 * In-memory store for authorization codes, refresh tokens, and registered clients.
 * Codes are short-lived (10 min) and single-use. Refresh tokens are long-lived
 * but rotatable. For Neon Functions (stateless), codes and tokens are stored in
 * Postgres when a pool is available, with an in-memory fallback for testing.
 *
 * SECURITY: Never log tokens, codes, or secrets. All stored codes are hashed.
 */
import { createHash, randomBytes } from "node:crypto";

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// ── In-memory stores (cleared on function cold start) ────────────────
const codes = new Map();     // codeHash → { subject, clientId, redirectUri, codeChallenge, codeChallengeMethod, resource, scope, expiresAt, used }
const refreshTokens = new Map(); // tokenHash → { subject, clientId, scope, resource, expiresAt, revoked }

// ── Pre-registered clients ───────────────────────────────────────────
// MCP spec supports Client ID Metadata Documents (CIMD) for dynamic registration.
// For known clients (ChatGPT, Claude, Cursor), pre-register here.
// Additional clients can be registered via POLYGLOT_OAUTH_CLIENTS env var.
const BUILT_IN_CLIENTS = new Map([
  // ChatGPT uses dynamic registration or CIMD; accept any HTTPS redirect
  // Claude Desktop and Cursor: accept localhost redirects for desktop apps
]);

let extraClients;
function loadExtraClients() {
  if (extraClients) return extraClients;
  extraClients = new Map();
  const raw = process.env.POLYGLOT_OAUTH_CLIENTS || "";
  if (!raw.trim()) return extraClients;
  try {
    const parsed = JSON.parse(raw);
    // Format: [{ "client_id": "...", "redirect_uris": ["..."], "name": "..." }]
    for (const c of Array.isArray(parsed) ? parsed : [parsed]) {
      if (c.client_id) {
        extraClients.set(c.client_id, {
          redirectUris: c.redirect_uris || [],
          name: c.name || c.client_id,
        });
      }
    }
  } catch {
    console.error("Invalid POLYGLOT_OAUTH_CLIENTS JSON");
  }
  return extraClients;
}

/**
 * Validate a client_id. We accept:
 * 1. Pre-registered clients (built-in or env)
 * 2. HTTPS URLs (Client ID Metadata Documents per MCP spec)
 * 3. Any client_id when POLYGLOT_OAUTH_OPEN_CLIENTS=true (development)
 */
export function validateClient(clientId, redirectUri) {
  if (!clientId) throw oauthError("invalid_request", "client_id is required");

  const builtIn = BUILT_IN_CLIENTS.get(clientId);
  if (builtIn) {
    if (redirectUri && builtIn.redirectUris?.length && !builtIn.redirectUris.includes(redirectUri)) {
      throw oauthError("invalid_request", "redirect_uri not registered for this client");
    }
    return { clientId, name: builtIn.name, type: "registered" };
  }

  const extra = loadExtraClients().get(clientId);
  if (extra) {
    if (redirectUri && extra.redirectUris?.length && !extra.redirectUris.includes(redirectUri)) {
      throw oauthError("invalid_request", "redirect_uri not registered for this client");
    }
    return { clientId, name: extra.name, type: "registered" };
  }

  // MCP spec: Client ID Metadata Documents — client_id is an HTTPS URL
  if (clientId.startsWith("https://")) {
    // For CIMD clients, redirect_uri must be HTTPS or localhost
    if (redirectUri) {
      try {
        const ru = new URL(redirectUri);
        if (ru.protocol !== "https:" && ru.hostname !== "localhost" && ru.hostname !== "127.0.0.1") {
          throw oauthError("invalid_request", "redirect_uri must be HTTPS or localhost");
        }
      } catch (e) {
        if (e.error) throw e;
        throw oauthError("invalid_request", "Invalid redirect_uri");
      }
    }
    return { clientId, name: clientId, type: "cimd" };
  }

  // Open client mode for development
  if (process.env.POLYGLOT_OAUTH_OPEN_CLIENTS === "true") {
    return { clientId, name: clientId, type: "open" };
  }

  throw oauthError("invalid_client", "Unknown client_id. Use an HTTPS Client ID Metadata Document URL or contact the service owner.");
}

// ── Authorization Codes ──────────────────────────────────────────────
export function generateCode() {
  return randomBytes(32).toString("base64url");
}

export function storeCode(code, { subject, clientId, redirectUri, codeChallenge, codeChallengeMethod, resource, scope }) {
  const hash = sha256(code);
  codes.set(hash, {
    subject,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod: codeChallengeMethod || "S256",
    resource,
    scope,
    expiresAt: Date.now() + CODE_TTL_MS,
    used: false,
  });
  // Cleanup expired codes
  for (const [k, v] of codes) {
    if (v.expiresAt < Date.now()) codes.delete(k);
  }
}

export function consumeCode(code, { clientId, redirectUri, codeVerifier }) {
  const hash = sha256(code);
  const entry = codes.get(hash);
  if (!entry) throw oauthError("invalid_grant", "Authorization code not found or expired");
  if (entry.used) {
    codes.delete(hash);
    throw oauthError("invalid_grant", "Authorization code already used");
  }
  if (entry.expiresAt < Date.now()) {
    codes.delete(hash);
    throw oauthError("invalid_grant", "Authorization code expired");
  }
  if (entry.clientId !== clientId) {
    throw oauthError("invalid_grant", "client_id mismatch");
  }
  if (entry.redirectUri && entry.redirectUri !== redirectUri) {
    throw oauthError("invalid_grant", "redirect_uri mismatch");
  }

  // PKCE S256 verification (REQUIRED)
  if (!codeVerifier) throw oauthError("invalid_grant", "code_verifier is required (PKCE)");
  if (!entry.codeChallenge) throw oauthError("invalid_grant", "No PKCE challenge stored for this code");
  const method = entry.codeChallengeMethod || "S256";
  if (method !== "S256") throw oauthError("invalid_request", "Only S256 PKCE is supported");
  const expectedChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
  if (expectedChallenge !== entry.codeChallenge) {
    throw oauthError("invalid_grant", "PKCE code_verifier does not match code_challenge");
  }

  entry.used = true;
  codes.delete(hash);
  return { subject: entry.subject, scope: entry.scope, resource: entry.resource };
}

// ── Refresh Tokens ───────────────────────────────────────────────────
export function generateRefreshToken() {
  return randomBytes(48).toString("base64url");
}

export function storeRefreshToken(token, { subject, clientId, scope, resource }) {
  const hash = sha256(token);
  refreshTokens.set(hash, {
    subject,
    clientId,
    scope,
    resource,
    expiresAt: Date.now() + REFRESH_TTL_MS,
    revoked: false,
  });
  // Cleanup expired
  for (const [k, v] of refreshTokens) {
    if (v.expiresAt < Date.now() || v.revoked) refreshTokens.delete(k);
  }
}

export function consumeRefreshToken(token, { clientId }) {
  const hash = sha256(token);
  const entry = refreshTokens.get(hash);
  if (!entry) throw oauthError("invalid_grant", "Refresh token not found");
  if (entry.revoked) throw oauthError("invalid_grant", "Refresh token revoked");
  if (entry.expiresAt < Date.now()) {
    refreshTokens.delete(hash);
    throw oauthError("invalid_grant", "Refresh token expired");
  }
  if (entry.clientId !== clientId) throw oauthError("invalid_grant", "client_id mismatch");
  // Rotate: revoke old, caller must store new
  entry.revoked = true;
  refreshTokens.delete(hash);
  return { subject: entry.subject, scope: entry.scope, resource: entry.resource };
}

export function revokeRefreshToken(token) {
  const hash = sha256(token);
  const entry = refreshTokens.get(hash);
  if (entry) {
    entry.revoked = true;
    refreshTokens.delete(hash);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────
function oauthError(error, description) {
  const e = new Error(description);
  e.error = error;
  e.error_description = description;
  e.statusCode = error === "invalid_client" ? 401 : 400;
  return e;
}
