/**
 * POLY-GLOT IDENTITY VERIFICATION
 * GOOSE NOTE: This file establishes who the user is. Do not decode JWTs without
 * signature, issuer, audience, and expiry verification. The verified subject is
 * the account key used to look up entitlements in Neon Postgres.
 *
 * Two token types are accepted:
 * 1. OAuth 2.1 access tokens (JWT, aud=MCP resource, iss=entitlements AS)
 *    — Issued by the Poly-Glot OAuth authorization server for MCP clients
 * 2. Apple ID tokens (JWT, aud=bundle/service ID, iss=appleid.apple.com)
 *    — Used by native apps and legacy MCP integrations
 *
 * OAuth access tokens are tried first. If the token is not an OAuth token
 * (wrong issuer/audience), Apple ID token verification is attempted as fallback.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

let oidcJwks;
let appleJwks;
let oauthJwks;

function bearer(req) {
  const headers = req?.headers;
  const value = typeof headers?.get === "function" ? headers.get("authorization") : headers?.authorization;
  const h = String(value || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

// ── OAuth Access Token Configuration ─────────────────────────────────
const ENTITLEMENTS_BASE = (process.env.POLYGLOT_ENTITLEMENTS_PUBLIC_URL ||
  "https://br-steep-leaf-ae2o29qz-entitlements.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "");
const MCP_RESOURCE = (process.env.POLYGLOT_MCP_RESOURCE_URL ||
  "https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech").replace(/\/$/, "");

/**
 * Try to verify token as an OAuth access token (issued by our AS).
 * Returns the subject if valid, null if not an OAuth token.
 */
async function tryOAuthToken(token) {
  try {
    oauthJwks ||= createRemoteJWKSet(new URL(`${ENTITLEMENTS_BASE}/oauth/jwks`));
    const { payload } = await jwtVerify(token, oauthJwks, {
      issuer: ENTITLEMENTS_BASE,
      audience: MCP_RESOURCE,
    });
    if (!payload.sub) return null;
    return String(payload.sub);
  } catch {
    return null; // Not an OAuth token or invalid — try other methods
  }
}

export async function verifyMcpUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });

  // 1. Try OAuth 2.1 access token first (preferred for MCP clients)
  const oauthSubject = await tryOAuthToken(token);
  if (oauthSubject) return oauthSubject;

  // 2. Fall back to Apple ID token / configurable OIDC (legacy + native)
  // Native app identities and MCP identities must resolve to the same
  // Sign in with Apple subject when Apple is the configured identity provider.
  // External OIDC installations can still supply their own issuer/audience.
  const issuer = String(process.env.POLYGLOT_OIDC_ISSUER || "https://appleid.apple.com").replace(/\/$/, "");
  const appleIssuer = issuer === "https://appleid.apple.com";
  const audience = process.env.POLYGLOT_OIDC_AUDIENCE ||
    (appleIssuer ? (process.env.APPLE_SIGN_IN_AUDIENCE || process.env.APPLE_BUNDLE_ID) : "");
  if (!audience) throw new Error("POLYGLOT_OIDC_AUDIENCE or APPLE_BUNDLE_ID is required");
  const jwksUrl = process.env.POLYGLOT_OIDC_JWKS_URL ||
    (appleIssuer ? "https://appleid.apple.com/auth/keys" : `${issuer}/.well-known/jwks.json`);
  oidcJwks ||= createRemoteJWKSet(new URL(jwksUrl));
  try {
    const { payload } = await jwtVerify(token, oidcJwks, { issuer, audience });
    if (!payload.sub) throw new Error("Token has no subject");
    return String(payload.sub);
  } catch {
    throw Object.assign(new Error("Invalid identity token"), { statusCode: 401 });
  }
}

export async function verifyAppleIdentityToken(identityToken) {
  if (!identityToken) throw Object.assign(new Error("Apple identity token required"), { statusCode: 401 });
  const audience = process.env.APPLE_SIGN_IN_AUDIENCE || process.env.APPLE_BUNDLE_ID || "ai.polyglot.workspace";
  appleJwks ||= createRemoteJWKSet(new URL("https://appleid.apple.com/auth/keys"));
  try {
    const { payload } = await jwtVerify(identityToken, appleJwks, {
      issuer: "https://appleid.apple.com",
      audience,
    });
    if (!payload.sub) throw new Error("Apple token has no subject");
    return String(payload.sub);
  } catch {
    // Invalid signatures, expiration and audience failures are auth errors,
    // not an internal server failure. Never return token contents in logs.
    throw Object.assign(new Error("Invalid Apple identity token"), { statusCode: 401 });
  }
}
