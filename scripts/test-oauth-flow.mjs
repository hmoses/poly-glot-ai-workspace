/**
 * OAuth 2.1 flow integration test.
 * Tests the authorization server metadata, JWKS, code exchange, PKCE validation,
 * token issuance, refresh, and revocation — all without Apple identity or network.
 *
 * This test uses the in-process OAuth modules directly (no HTTP server needed).
 * It does NOT test Apple web sign-in (requires real Apple credentials).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";

import {
  authorizationServerMetadata,
  jwksEndpoint,
  handleToken,
  handleRevoke,
  handleRegister,
  protectedResourceMetadata,
} from "../entitlement-service/oauth.js";
import {
  validateClient,
  generateCode,
  storeCode,
  consumeCode,
  generateRefreshToken,
  storeRefreshToken,
  consumeRefreshToken,
} from "../entitlement-service/oauth-store.js";

const MCP_RESOURCE = process.env.POLYGLOT_MCP_RESOURCE_URL ||
  "https://br-steep-leaf-ae2o29qz-mcp.compute.c-2.us-east-2.aws.neon.tech";

describe("OAuth Authorization Server Metadata", () => {
  it("returns valid AS metadata with required fields", () => {
    const meta = authorizationServerMetadata();
    assert.ok(meta.issuer, "issuer required");
    assert.ok(meta.authorization_endpoint, "authorization_endpoint required");
    assert.ok(meta.token_endpoint, "token_endpoint required");
    assert.ok(meta.jwks_uri, "jwks_uri required");
    assert.deepEqual(meta.response_types_supported, ["code"]);
    assert.deepEqual(meta.code_challenge_methods_supported, ["S256"]);
    assert.ok(meta.grant_types_supported.includes("authorization_code"));
    assert.ok(meta.grant_types_supported.includes("refresh_token"));
  });

  it("returns valid protected resource metadata", () => {
    const meta = protectedResourceMetadata();
    assert.ok(meta.resource, "resource required");
    assert.ok(Array.isArray(meta.authorization_servers) && meta.authorization_servers.length > 0);
    assert.ok(meta.bearer_methods_supported.includes("header"));
  });
});

describe("OAuth JWKS", () => {
  it("returns a JWKS with at least one key", async () => {
    const jwks = await jwksEndpoint();
    assert.ok(jwks.keys, "keys array required");
    assert.ok(jwks.keys.length > 0, "at least one key");
    const key = jwks.keys[0];
    assert.ok(key.kid, "kid required");
    assert.equal(key.alg, "ES256");
    assert.equal(key.use, "sig");
    assert.ok(!key.d, "private key must not be exposed in JWKS");
  });
});

describe("OAuth PKCE + Code Exchange", () => {
  it("generates and validates an authorization code with PKCE S256", () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    assert.ok(code.length > 20, "code should be sufficiently random");

    storeCode(code, {
      subject: "test-subject-001",
      clientId: "https://test-client.example.com",
      redirectUri: "https://test-client.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read mcp:write",
    });

    const result = consumeCode(code, {
      clientId: "https://test-client.example.com",
      redirectUri: "https://test-client.example.com/callback",
      codeVerifier,
    });
    assert.equal(result.subject, "test-subject-001");
    assert.equal(result.scope, "mcp:read mcp:write");
  });

  it("rejects wrong PKCE verifier", () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-002",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    assert.throws(() => consumeCode(code, {
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeVerifier: "wrong-verifier-value",
    }), /PKCE/i);
  });

  it("rejects missing PKCE verifier", () => {
    const codeChallenge = createHash("sha256").update("verifier").digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-003",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    assert.throws(() => consumeCode(code, {
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeVerifier: undefined,
    }), /code_verifier/i);
  });

  it("rejects double-use of authorization code", () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-004",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    consumeCode(code, {
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeVerifier,
    });
    assert.throws(() => consumeCode(code, {
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeVerifier,
    }), /not found|expired|already used/i);
  });

  it("rejects wrong client_id", () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-005",
      clientId: "https://correct-client.example.com",
      redirectUri: "https://correct-client.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    assert.throws(() => consumeCode(code, {
      clientId: "https://wrong-client.example.com",
      redirectUri: "https://correct-client.example.com/callback",
      codeVerifier,
    }), /client_id mismatch/i);
  });

  it("rejects wrong redirect_uri", () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-006",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    assert.throws(() => consumeCode(code, {
      clientId: "https://test.example.com",
      redirectUri: "https://evil.example.com/steal",
      codeVerifier,
    }), /redirect_uri mismatch/i);
  });
});

describe("OAuth Client Validation", () => {
  it("accepts HTTPS Client ID Metadata Document URLs", () => {
    const result = validateClient("https://chatgpt.com/.well-known/client-id.json", "https://chatgpt.com/callback");
    assert.equal(result.type, "cimd");
  });

  it("rejects non-HTTPS client IDs without open mode", () => {
    const orig = process.env.POLYGLOT_OAUTH_OPEN_CLIENTS;
    delete process.env.POLYGLOT_OAUTH_OPEN_CLIENTS;
    assert.throws(() => validateClient("random-client-id", "https://example.com/callback"), /Unknown client_id/i);
    if (orig !== undefined) process.env.POLYGLOT_OAUTH_OPEN_CLIENTS = orig;
  });

  it("rejects HTTP redirect URIs for CIMD clients", () => {
    assert.throws(() => validateClient("https://example.com/client", "http://evil.com/steal"), /HTTPS or localhost/i);
  });

  it("allows localhost redirects for desktop apps", () => {
    const result = validateClient("https://cursor.sh/.well-known/client-id.json", "http://localhost:3000/callback");
    assert.equal(result.type, "cimd");
  });
});

describe("OAuth Refresh Tokens", () => {
  it("stores and consumes refresh token with rotation", () => {
    const token = generateRefreshToken();
    storeRefreshToken(token, {
      subject: "test-subject-rt-001",
      clientId: "https://test.example.com",
      scope: "mcp:read mcp:write",
      resource: MCP_RESOURCE,
    });
    const result = consumeRefreshToken(token, { clientId: "https://test.example.com" });
    assert.equal(result.subject, "test-subject-rt-001");
    // Second use should fail (rotation)
    assert.throws(() => consumeRefreshToken(token, { clientId: "https://test.example.com" }), /not found/i);
  });

  it("rejects wrong client_id for refresh", () => {
    const token = generateRefreshToken();
    storeRefreshToken(token, {
      subject: "test-subject-rt-002",
      clientId: "https://correct.example.com",
      scope: "mcp:read",
      resource: MCP_RESOURCE,
    });
    assert.throws(() => consumeRefreshToken(token, { clientId: "https://wrong.example.com" }), /client_id mismatch/i);
  });
});

describe("OAuth Token Endpoint", () => {
  it("exchanges code for access + refresh token", async () => {
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");
    const code = generateCode();
    storeCode(code, {
      subject: "test-subject-token-001",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge,
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read mcp:write",
    });

    const result = await handleToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://test.example.com/callback",
      client_id: "https://test.example.com",
      code_verifier: codeVerifier,
    });
    assert.ok(result.access_token, "access_token required");
    assert.ok(result.refresh_token, "refresh_token required");
    assert.equal(result.token_type, "Bearer");
    assert.ok(result.expires_in > 0, "expires_in must be positive");
    // Access token should be a JWT (three parts)
    assert.equal(result.access_token.split(".").length, 3, "access_token should be a JWT");
  });

  it("rejects unsupported grant_type", async () => {
    await assert.rejects(() => handleToken({
      grant_type: "password",
      client_id: "https://test.example.com",
    }), /unsupported/i);
  });

  it("rejects missing code_verifier", async () => {
    const code = generateCode();
    storeCode(code, {
      subject: "test-sub",
      clientId: "https://test.example.com",
      redirectUri: "https://test.example.com/callback",
      codeChallenge: "dummy",
      codeChallengeMethod: "S256",
      resource: MCP_RESOURCE,
      scope: "mcp:read",
    });
    await assert.rejects(() => handleToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: "https://test.example.com/callback",
      client_id: "https://test.example.com",
    }), /code_verifier/i);
  });
});

describe("OAuth Dynamic Client Registration", () => {
  it("registers a client with HTTPS redirect URIs", () => {
    const result = handleRegister({
      redirect_uris: ["https://myapp.example.com/callback"],
      client_name: "Test App",
    });
    assert.ok(result.client_id, "client_id required");
    assert.ok(result.client_id.startsWith("polyglot-"));
    assert.deepEqual(result.redirect_uris, ["https://myapp.example.com/callback"]);
    assert.equal(result.client_name, "Test App");
  });

  it("rejects HTTP redirect URIs", () => {
    assert.throws(() => handleRegister({
      redirect_uris: ["http://evil.com/steal"],
      client_name: "Bad App",
    }), /HTTPS or localhost/i);
  });

  it("rejects empty redirect URIs", () => {
    assert.throws(() => handleRegister({
      redirect_uris: [],
    }), /redirect_uris/i);
  });
});

describe("OAuth Revocation", () => {
  it("revokes a refresh token", () => {
    const token = generateRefreshToken();
    storeRefreshToken(token, {
      subject: "test-revoke-001",
      clientId: "https://test.example.com",
      scope: "mcp:read",
      resource: MCP_RESOURCE,
    });
    const result = handleRevoke({ token, token_type_hint: "refresh_token" });
    assert.deepEqual(result, {}); // 200 OK per RFC 7009
    // Token should no longer be usable
    assert.throws(() => consumeRefreshToken(token, { clientId: "https://test.example.com" }), /not found/i);
  });

  it("silently succeeds for unknown tokens", () => {
    const result = handleRevoke({ token: "nonexistent-token" });
    assert.deepEqual(result, {});
  });
});
