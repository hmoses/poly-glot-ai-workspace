/**
 * POLY-GLOT IDENTITY VERIFICATION
 * GOOSE NOTE: This file establishes who the user is. Do not decode JWTs without
 * signature, issuer, audience, and expiry verification. The verified subject is
 * the account key used to look up entitlements in Neon Postgres.
 */
import { createRemoteJWKSet, jwtVerify } from "jose";

let oidcJwks;
let appleJwks;

function bearer(req) {
  const headers = req?.headers;
  const value = typeof headers?.get === "function" ? headers.get("authorization") : headers?.authorization;
  const h = String(value || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export async function verifyMcpUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
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
  const { payload } = await jwtVerify(identityToken, appleJwks, {
    issuer: "https://appleid.apple.com",
    audience,
  });
  if (!payload.sub) throw Object.assign(new Error("Apple token has no subject"), { statusCode: 401 });
  return String(payload.sub);
}
