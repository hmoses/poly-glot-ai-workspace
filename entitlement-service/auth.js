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
  const h = String(req.headers.authorization || "");
  return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

export async function verifyMcpUser(req) {
  const token = bearer(req);
  if (!token) throw Object.assign(new Error("Authentication required"), { statusCode: 401 });
  const issuer = String(process.env.POLYGLOT_OIDC_ISSUER || "").replace(/\/$/, "");
  const audience = process.env.POLYGLOT_OIDC_AUDIENCE;
  if (!issuer || !audience) throw new Error("POLYGLOT_OIDC_ISSUER and POLYGLOT_OIDC_AUDIENCE are required");
  const jwksUrl = process.env.POLYGLOT_OIDC_JWKS_URL || `${issuer}/.well-known/jwks.json`;
  oidcJwks ||= createRemoteJWKSet(new URL(jwksUrl));
  const { payload } = await jwtVerify(token, oidcJwks, { issuer, audience });
  if (!payload.sub) throw Object.assign(new Error("Token has no subject"), { statusCode: 401 });
  return String(payload.sub);
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
