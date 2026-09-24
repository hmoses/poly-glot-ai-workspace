# 405 Root Cause Report

## Date
2026-09-24

## Error Observed
```
Request failed: error sending request for url (https://api.anthropic.com/v1/messages).
{
  "type": "error",
  "error": {
    "type": "invalid_request_error",
    "message": "Method Not Allowed"
  }
}
```

## Source Identification

### Where the 405 originates
**Goose → Anthropic API** (provider-level)

The 405 is returned by `https://api.anthropic.com/v1/messages` — the Anthropic Messages API endpoint. This is the LLM provider endpoint that Goose calls to get AI completions.

### Evidence
1. The URL in the error is `https://api.anthropic.com/v1/messages` — an Anthropic endpoint, not a Poly-Glot endpoint.
2. The error body format (`{"type":"error","error":{"type":"invalid_request_error",...}}`) is Anthropic's standard error envelope.
3. Goose config confirms: `GOOSE_PROVIDER: anthropic`, `ANTHROPIC_HOST: https://api.anthropic.com`, `GOOSE_MODEL: claude-opus-4-6`.
4. The Poly-Glot MCP server runs on `localhost:8787/mcp` — a completely different host and path.
5. The Poly-Glot entitlement service runs on `/v1/` routes — also unrelated.

### NOT the source
- ❌ Poly-Glot MCP server (`localhost:8787/mcp`) — accepts POST/GET/DELETE/OPTIONS correctly
- ❌ Poly-Glot entitlement API (`/v1/entitlements/me`, `/v1/trials/start`, etc.) — has proper method routing
- ❌ GitHub MCP extension — different host entirely
- ❌ App Store Connect API — different host entirely

### Probable Cause
Transient Anthropic API issue where:
1. A network interruption causes the HTTP client to retry with a wrong method (e.g., GET instead of POST)
2. Anthropic's load balancer/gateway returns 405 during brief maintenance windows
3. The Goose HTTP client encounters a redirect that strips the POST method
4. Rate limiting or connection pooling causes method confusion

### Goose Configuration (verified correct)
```yaml
GOOSE_PROVIDER: anthropic
ANTHROPIC_HOST: https://api.anthropic.com
GOOSE_MODEL: claude-opus-4-6
```

The endpoint `POST https://api.anthropic.com/v1/messages` is the correct Chat Completions path for Anthropic.

## Impact on Poly-Glot
**None.** The 405 occurs before any request reaches Poly-Glot. However, when Goose crashes from the 405, it can lose in-progress work (file edits, build steps, ASC submissions). The resilience system protects against this data loss.

## Recommendations
1. Do NOT modify Poly-Glot API semantics (per Phase 9 of runbook)
2. Add resilience/retry/checkpoint to Poly-Glot's own HTTP handling for defense-in-depth
3. Add proper 405 responses with Allow headers to Poly-Glot routes
4. Add structured error logging with redaction
5. Document the provider limitation
